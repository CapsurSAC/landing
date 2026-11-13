<?php
/**
 * Endpoint del formulario de la landing de CAPSUR.
 *
 * Recibe JSON desde React, valida, guarda un respaldo en CSV, registra el
 * lead en Chatwoot (si hay CHATWOOT_TOKEN) y envía el correo por SMTP.
 * Responde siempre en JSON.
 */
declare(strict_types=1);

// La configuración vive FUERA de public_html en cPanel (dos niveles arriba) y
// en server/config dentro del repositorio (un nivel arriba). Se acepta cualquiera.
$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap.php';
require $carpetaConfig . '/chatwoot.php';

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

// ── 1. Solo se acepta POST ─────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(405, ['ok' => false, 'error' => 'Método no permitido']);
}

// ── 2. El origen debe ser el propio sitio, y el cuerpo JSON ────────────────
exigirOrigenPropio();
exigirJson();

// ── 3. Límite por IP ───────────────────────────────────────────────────────
// Solo se comprueba aquí; la cuenta se incrementa más abajo, una vez que la
// solicitud resultó válida. Así, equivocarse al llenar el formulario no gasta
// el cupo de nadie.
$ip             = ipVisitante();
$ipLimite       = ipParaLimite($ip);
$limiteEnvios   = max(1, (int) env('LIMITE_ENVIOS', '5'));
$limiteVentana  = max(60, (int) env('LIMITE_VENTANA', '900'));
$demasiados     = [
    'ok'    => false,
    'error' => 'Ya enviaste varias solicitudes. Espera unos minutos antes de volver a intentarlo.',
];

if (enviosRecientes($ipLimite, $limiteVentana) >= $limiteEnvios) {
    responder(429, $demasiados);
}

// ── 4. Lectura del cuerpo ──────────────────────────────────────────────────
$crudo = file_get_contents('php://input', false, null, 0, 20001) ?: ''; // ni un byte más de los que se aceptan
if (strlen($crudo) > 20000) {
    responder(413, ['ok' => false, 'error' => 'Solicitud demasiado grande']);
}

$entrada = json_decode($crudo, true);
if (!is_array($entrada)) {
    responder(400, ['ok' => false, 'error' => 'JSON no válido']);
}

// ── 5. Trampa para bots ────────────────────────────────────────────────────
// Si el campo oculto viene lleno, fingimos éxito: el bot no aprende nada.
if (!empty($entrada['website'])) {
    error_log("CAPSUR: honeypot activado desde {$ip}");
    responder(200, ['ok' => true]);
}

// ── 6. Validación ──────────────────────────────────────────────────────────
$nombre   = limpiar($entrada['nombre']   ?? '', 80);
$whatsapp = limpiar($entrada['whatsapp'] ?? '', 20);
$area     = limpiar($entrada['area']     ?? '', 60);
$objetivo = limpiar($entrada['objetivo'] ?? '', 60);
$inicio   = limpiar($entrada['inicio']   ?? '', 60);
$pagina   = limpiar($entrada['pagina']   ?? '', 300);
$version  = limpiar($entrada['version_consentimiento'] ?? '', 30);
$utm      = utmDe($entrada, $pagina);

// Identificador del envío (UUID) y código corto del área (COMP, MIN…).
// Ninguno es obligatorio: un formulario viejo en caché del navegador no los manda.
$envioId = strtolower(limpiar($entrada['envio_id'] ?? '', 36));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $envioId)) {
    $envioId = '';
}
$areaCodigo = strtoupper(limpiar($entrada['area_codigo'] ?? '', 6));
if (!preg_match('/^[A-Z]{2,6}$/', $areaCodigo)) {
    $areaCodigo = 'GEN';
}

// Códigos de las tres respuestas (computacion, titulacion, inmediato…): van a
// los atributos de la conversación en Chatwoot. Tampoco son obligatorios.
$codigo = static function (mixed $valor): string {
    $valor = strtolower(limpiar($valor, 40));
    return preg_match('/^[a-z0-9-]{1,40}$/', $valor) ? $valor : '';
};
$areaValor     = $codigo($entrada['area_valor'] ?? '');
$objetivoValor = $codigo($entrada['objetivo_valor'] ?? '');
$inicioValor   = $codigo($entrada['inicio_valor'] ?? '');

$correo     = filter_var(trim(texto($entrada['email'] ?? '')), FILTER_VALIDATE_EMAIL);
$consiente  = filter_var($entrada['consentimiento'] ?? false, FILTER_VALIDATE_BOOLEAN);
$marketing  = filter_var($entrada['marketing'] ?? false, FILTER_VALIDATE_BOOLEAN);

// Las mismas reglas que el formulario, del mismo archivo (config/reglas.json):
// celular peruano de 9 dígitos que empieza con 9, con o sin +51, y correo cuyo
// dominio termina en punto y dos letras o más. Además se rechazan los celulares
// evidentemente inventados (987 654 321…).
$errores = [];
if (mb_strlen($nombre) < 3)                   $errores[] = 'nombre';
if (!$correo || !correoValido($correo))       $errores[] = 'email';
if ($area === '')                             $errores[] = 'area';
if ($objetivo === '')                         $errores[] = 'objetivo';
if ($inicio === '')                           $errores[] = 'inicio';
if (!$consiente)                              $errores[] = 'consentimiento';
if ($whatsapp !== '' && !celularValido($whatsapp)) {
    $errores[] = 'whatsapp';
} elseif (celularInventado($whatsapp)) {
    $errores[] = 'whatsapp';
}

if ($errores) {
    responder(422, [
        'ok'      => false,
        'error'   => 'Revisa los campos marcados',
        'campos'  => $errores,
    ]);
}

// El programa que miraba en programas.html al tocar "Me interesa" (puede venir vacío).
$programa = limpiar($entrada['programa'] ?? '', 160);

// Anti-bots (Cloudflare Turnstile), solo si hay TURNSTILE_SECRET. Un reintento
// del mismo envio_id ya pasó la prueba: no se le vuelve a pedir.
if (env('TURNSTILE_SECRET') !== '' && !is_file($carpetaConfig . '/../storage/envios/' . $envioId)
    && !turnstileValido(texto($entrada['turnstile'] ?? ''), $ip)) {
    responder(403, ['ok' => false, 'error' => 'No pudimos comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.']);
}

// Junto a la configuración, como el límite por IP: /home/usuario/storage en
// cPanel, /var/www/storage en Docker y server/storage (ignorada por git) en el repositorio.
$carpetaDatos = $carpetaConfig . '/../storage';
if (!is_dir($carpetaDatos . '/envios')) {
    @mkdir($carpetaDatos . '/envios', 0755, true);
}

// ── 7. ¿Este envío ya llegó antes? ─────────────────────────────────────────
// Si la respuesta no le llegó (se cortó la red) y la persona reintenta con el
// mismo envio_id, el lead ya está en el CSV y solo se reintenta el correo. Y si
// ya salió todo bien, se responde éxito sin repetir nada.
//
// La marca queda bloqueada hasta que termina la petición: si llegan dos envíos
// iguales a la vez (doble clic), el segundo espera aquí y al entrar ya lee lo
// que dejó el primero.
$marca          = $envioId !== '' ? $carpetaDatos . '/envios/' . $envioId : '';
$manejadorMarca = $marca !== '' ? @fopen($marca, 'c+') : false;
$estadoPrevio   = '';
if ($manejadorMarca) {
    flock($manejadorMarca, LOCK_EX);
    $estadoPrevio = trim((string) stream_get_contents($manejadorMarca));
}
$marcar = static function (string $estado) use ($manejadorMarca): void {
    if ($manejadorMarca) {
        rewind($manejadorMarca);
        ftruncate($manejadorMarca, 0);
        fwrite($manejadorMarca, $estado);
        fflush($manejadorMarca);
    }
};

if ($estadoPrevio === 'enviado') {
    responder(200, ['ok' => true]);
}

// Reintento de un lead ya guardado: solo vuelve a intentar el correo, y a lo
// sumo 3 veces. Sin este tope, repetir el mismo envio_id mandaría correos sin
// fin sin pasar por el límite por IP (que solo cuenta los leads nuevos).
if ($estadoPrevio === 'csv' && $marca !== '') {
    $intentos = (int) @file_get_contents($marca . '.intentos') + 1;
    @file_put_contents($marca . '.intentos', (string) $intentos, LOCK_EX);
    if ($intentos > 3) {
        responder(200, ['ok' => true]); // el lead ya está a salvo en el CSV y en el panel
    }
}

// El lead ya está a salvo en el CSV (de esta petición o de un intento anterior).
$guardado = $estadoPrevio === 'csv';

$fecha = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d H:i:s');

// ── 8. Respaldo en CSV ANTES de enviar ─────────────────────────────────────
// Si el SMTP falla, el registro ya quedó guardado y no se pierde a nadie.
if ($estadoPrevio === '') {
    // La solicitud es válida y nueva: ahora sí cuenta para el límite de la IP.
    // Se vuelve a comprobar aquí, a la vez que se anota: varias solicitudes
    // lanzadas juntas pasan todas la comprobación de arriba.
    if (!registrarSiCabe($ipLimite, $limiteVentana, $limiteEnvios)) {
        responder(429, $demasiados);
    }
    limpiezaOcasional();

    $csv     = $carpetaDatos . '/leads.csv';
    $esNuevo = !file_exists($csv);

    if ($manejador = @fopen($csv, 'a')) {
        flock($manejador, LOCK_EX);
        if ($esNuevo) {
            fputcsv($manejador, COLUMNAS_LEADS);
        }
        // celdaCsv: este archivo se descarga y se abre en Excel tal cual.
        fputcsv($manejador, array_map('celdaCsv', [
            $fecha, $nombre, $correo, $whatsapp, $area, $objetivo, $inicio,
            $consiente ? 'si' : 'no', $marketing ? 'si' : 'no', $version, $ip, $pagina,
            $envioId, $areaCodigo,
            $utm['utm_source'], $utm['utm_medium'], $utm['utm_campaign'], $utm['utm_content'],
            $programa,
        ]));
        flock($manejador, LOCK_UN);
        fclose($manejador);
        $marcar('csv');
        $guardado = true;
        $leadNuevo = true;
    } else {
        error_log('CAPSUR: no se pudo escribir en ' . $csv);
    }
}

// ── 8a. Avisos: asesor al instante (n8n) y copia en Google Sheets ──────────
// Solo para leads nuevos, con 3 s de espera como mucho: si fallan, el lead ya
// está a salvo y la persona no se entera.
if (!empty($leadNuevo)) {
    $resumen = [
        'fecha' => $fecha, 'nombre' => $nombre, 'correo' => $correo, 'whatsapp' => $whatsapp,
        'area' => $area, 'programa' => $programa, 'objetivo' => $objetivo, 'inicio' => $inicio,
        'marketing' => $marketing, 'envio_id' => $envioId, 'area_codigo' => $areaCodigo,
        'panel' => '/admin/',
    ] + $utm;
    foreach (['AVISO_WEBHOOK_URL', 'SHEETS_WEBHOOK_URL'] as $variable) {
        if (env($variable) !== '') {
            avisarWebhook(env($variable), $resumen);
        }
    }
}

// ── 8b. Ya no es un posible ────────────────────────────────────────────────
// Lo que escribió antes de enviar estaba en storage/posibles (api/posible.php).
// Se borra y queda la marca .enviado: un borrador que llegue tarde no lo revive.
$posibleId = strtolower(limpiar($entrada['posible_id'] ?? '', 36));
if ($guardado && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $posibleId)) {
    $carpetaPosibles = $carpetaDatos . '/posibles';
    if (is_dir($carpetaPosibles) || @mkdir($carpetaPosibles, 0755, true)) {
        @touch($carpetaPosibles . '/' . $posibleId . '.enviado');
        @unlink($carpetaPosibles . '/' . $posibleId . '.json');
    }
}

// ── 9. Registro en Chatwoot ────────────────────────────────────────────────
// Nada de lo que pase aquí detiene el correo ni la respuesta: si Chatwoot no
// contesta, el lead queda en la cola y se reintenta solo (config/chatwoot.php).
if (cw_activo()) {
    try {
        cw_registrar([
            // Un formulario viejo en caché no manda envio_id: se le pone uno aquí.
            'envio_id'       => $envioId !== '' ? $envioId : vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex(random_bytes(16)), 4)),
            'fecha'          => $fecha,
            'nombre'         => $nombre,
            'correo'         => $correo,
            'whatsapp'       => $whatsapp,
            'area'           => $area,
            'objetivo'       => $objetivo,
            'inicio'         => $inicio,
            'area_codigo'    => $areaCodigo,
            'area_valor'     => $areaValor,
            'objetivo_valor' => $objetivoValor,
            'inicio_valor'   => $inicioValor,
            'marketing'      => $marketing,
            'version'        => $version,
            'pagina'         => $pagina,
            'utm'            => $utm,
            'programa'       => $programa,
        ]);
    } catch (Throwable $err) {
        error_log('CAPSUR: fallo al registrar en Chatwoot — ' . $err->getMessage());
    }
}

// ── 10. Envío del correo ───────────────────────────────────────────────────
$e = static fn (string $t): string => htmlspecialchars($t, ENT_QUOTES, 'UTF-8');

// "email · capsur_clientes_frios · correo_1", o "Directo" si llegó sin UTM.
$origenLead = implode(' · ', array_filter([$utm['utm_source'], $utm['utm_campaign'], $utm['utm_content']])) ?: 'Directo';

$filas = [
    'Nombre'            => $nombre,
    'Correo'            => $correo,
    'WhatsApp'          => $whatsapp !== '' ? $whatsapp : '—',
    'Área de interés'   => $area,
    'Programa que vio'  => $programa !== '' ? $programa : '—',
    'Qué busca'         => $objetivo,
    'Cuándo empezar'    => $inicio,
    'Acepta marketing'  => $marketing ? 'Sí' : 'No',
    'Origen'            => $origenLead,
];

$cuerpoHtml = '
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a202c">
  <div style="background:#0A2A63;padding:22px 26px;border-radius:10px 10px 0 0">
    <h1 style="margin:0;color:#fff;font-size:19px">Nueva solicitud de orientación</h1>
    <p style="margin:6px 0 0;color:#a9c4ee;font-size:13px">CAPSUR Grupo Educativo</p>
  </div>
  <table style="width:100%;border-collapse:collapse;background:#fff;
                border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px">';

foreach ($filas as $etiqueta => $valor) {
    $cuerpoHtml .= '
    <tr>
      <td style="padding:11px 26px;border-bottom:1px solid #edf2f7;color:#4a5568;
                 font-size:13px;width:170px">' . $e($etiqueta) . '</td>
      <td style="padding:11px 26px;border-bottom:1px solid #edf2f7;
                 font-size:14px;font-weight:bold">' . $e($valor) . '</td>
    </tr>';
}

$cuerpoHtml .= '
    <tr>
      <td colspan="2" style="padding:16px 26px;color:#718096;font-size:12px;line-height:1.6">
        Recibido el ' . $e($fecha) . ' (hora de Lima)<br>
        Consentimiento de datos aceptado · versión ' . $e($version ?: 'sin registrar') . '<br>
        IP de origen: ' . $e($ip) . '
      </td>
    </tr>
  </table>
  <p style="text-align:center;color:#a0aec0;font-size:11px;margin-top:16px">
    Puedes responder directamente a este correo para contactar a la persona.
  </p>
</div>';

$cuerpoTexto = "NUEVA SOLICITUD DE ORIENTACIÓN — CAPSUR\n\n";
foreach ($filas as $etiqueta => $valor) {
    $cuerpoTexto .= "{$etiqueta}: {$valor}\n";
}
$cuerpoTexto .= "\nRecibido el {$fecha} (hora de Lima)\nIP: {$ip}\n";

// Sin SMTP configurado no se intenta: el lead ya quedó en el panel y la persona no debe ver un error.
if (trim((string) env('SMTP_HOST')) === '' || trim((string) env('MAIL_TO')) === '') {
    if ($guardado) {
        error_log('CAPSUR: SMTP sin configurar; el lead quedó solo en el CSV');
        responder(200, ['ok' => true]);
    }
    responder(500, ['ok' => false, 'error' => 'No pudimos enviar la solicitud en este momento']);
}

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host       = env('SMTP_HOST');
    $mail->SMTPAuth   = true;
    $mail->Username   = env('SMTP_USER');
    $mail->Password   = env('SMTP_PASS');
    $mail->Port       = (int) env('SMTP_PORT', '587');
    $mail->SMTPSecure = $mail->Port === 465
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->CharSet    = 'UTF-8';
    $mail->Timeout    = 15;

    // IMPORTANTE: el remitente es SIEMPRE una dirección del dominio propio.
    // Poner aquí el correo del visitante rompería SPF/DMARC y el mensaje
    // acabaría en spam. El correo del visitante va en Reply-To, de modo que
    // al pulsar "Responder" se le contesta directamente a él.
    $mail->setFrom(env('MAIL_FROM'), env('MAIL_FROM_NOMBRE', 'Formulario web CAPSUR'));
    $mail->addReplyTo($correo, $nombre);

    foreach (array_filter(array_map('trim', explode(',', env('MAIL_TO')))) as $destino) {
        $mail->addAddress($destino);
    }

    $mail->isHTML(true);
    $mail->Subject = sprintf('Nueva solicitud: %s — %s', $nombre, $area);
    $mail->Body    = $cuerpoHtml;
    $mail->AltBody = $cuerpoTexto;

    $mail->send();
    $marcar('enviado');

    // Confirmación a la persona, con lo que pidió (CORREO_CONFIRMACION=0 la apaga).
    // Si falla, no cambia nada: su solicitud ya llegó al equipo.
    if (env('CORREO_CONFIRMACION', '1') !== '0' && !empty($leadNuevo)) {
        try {
            $mail->clearAllRecipients();
            $mail->clearReplyTos();
            $mail->addAddress($correo, $nombre);
            if (($responder = trim(explode(',', env('MAIL_TO'))[0] ?? '')) !== '') {
                $mail->addReplyTo($responder);
            }
            $resumenVisitante = array_filter([
                'Área de interés' => $area,
                'Programa'        => $programa,
                'Qué buscas'      => $objetivo,
                'Cuándo empezar'  => $inicio,
            ]);
            $lista = '';
            foreach ($resumenVisitante as $etiqueta => $valor) {
                $lista .= '<li style="margin:4px 0"><strong>' . $e($etiqueta) . ':</strong> ' . $e($valor) . '</li>';
            }
            $nombrePila = explode(' ', $nombre)[0];
            $mail->Subject = 'Recibimos tu solicitud — CAPSUR';
            $mail->Body = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a202c">'
                . '<div style="background:#0A2A63;padding:20px 24px;border-radius:10px 10px 0 0"><h1 style="margin:0;color:#fff;font-size:19px">¡Gracias, ' . $e($nombrePila) . '!</h1></div>'
                . '<div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:20px 24px;font-size:14px;line-height:1.6">'
                . '<p style="margin-top:0">Recibimos tu solicitud de orientación. Un asesor de CAPSUR revisará tus respuestas y te contactará con las alternativas que mejor encajen contigo.</p>'
                . '<ul style="padding-left:18px">' . $lista . '</ul>'
                . '<p style="color:#718096;font-size:12px;margin-bottom:0">Si no fuiste tú, ignora este correo o respóndelo y borraremos tus datos.</p>'
                . '</div></div>';
            $mail->AltBody = "¡Gracias, {$nombrePila}!\n\nRecibimos tu solicitud de orientación. Un asesor de CAPSUR te contactará pronto.\n\n"
                . implode("\n", array_map(static fn ($k, $v) => "{$k}: {$v}", array_keys($resumenVisitante), $resumenVisitante))
                . "\n\nSi no fuiste tú, responde este correo y borraremos tus datos.\n";
            $mail->send();
        } catch (Exception $errConfirmacion) {
            error_log('CAPSUR: no salió la confirmación al visitante — ' . $mail->ErrorInfo);
        }
    }

    responder(200, ['ok' => true]);
} catch (Exception $err) {
    error_log('CAPSUR: fallo SMTP — ' . $mail->ErrorInfo);
    // Si el lead quedó en el CSV no se pierde: la persona ve éxito y el equipo lo
    // encuentra en el panel. Solo es error si tampoco se pudo guardar.
    if ($guardado) {
        responder(200, ['ok' => true]);
    }
    responder(500, [
        'ok'    => false,
        'error' => 'No pudimos enviar la solicitud en este momento',
    ]);
}
