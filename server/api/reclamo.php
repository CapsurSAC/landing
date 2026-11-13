<?php
/**
 * Libro de Reclamaciones virtual (Ley 29571 y D.S. 011-2011-PCM).
 *
 * Recibe la hoja desde libro-de-reclamaciones.html, le asigna un número
 * correlativo (CAPSUR-AAAA-000001), la guarda en storage/reclamos/<número>.json
 * y manda una copia al consumidor y al equipo. Se responde desde el panel
 * (admin/reclamos.php) en 15 días hábiles como máximo.
 *
 * Las hojas NO se borran solas: la norma pide conservarlas al menos 2 años.
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap.php';

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(405, ['ok' => false, 'error' => 'Método no permitido']);
}
exigirOrigenPropio();
exigirJson();

$ip = ipVisitante();
// Nadie presenta más de 3 hojas por hora: el resto es abuso.
if (!registrarSiCabe('reclamos:' . ipParaLimite($ip), 3600, 3)) {
    responder(429, ['ok' => false, 'error' => 'Ya registraste varias hojas. Espera un momento antes de enviar otra.']);
}

$crudo = file_get_contents('php://input', false, null, 0, 20001) ?: '';
$entrada = strlen($crudo) <= 20000 ? json_decode($crudo, true) : null;
if (!is_array($entrada)) {
    responder(400, ['ok' => false, 'error' => 'Solicitud no válida']);
}
if (!empty($entrada['website'])) {
    responder(200, ['ok' => true, 'numero' => 'CAPSUR-0000-000000']); // bot: que no aprenda nada
}

/** Texto de varias líneas: como limpiar(), pero conserva los saltos de línea. */
$parrafo = static fn (mixed $v, int $max): string => mb_substr(trim((string) preg_replace(
    ["/\r\n?/", "/[^\P{C}\n]/u"],
    ["\n", ''],
    texto($v)
)), 0, $max);

$hoja = [
    'nombre'           => limpiar($entrada['nombre'] ?? '', 100),
    'tipo_documento'   => in_array($entrada['tipo_documento'] ?? '', ['DNI', 'Carné de extranjería', 'Pasaporte'], true) ? $entrada['tipo_documento'] : '',
    'documento'        => strtoupper((string) preg_replace('/[^A-Za-z0-9]/', '', limpiar($entrada['documento'] ?? '', 15))),
    'domicilio'        => limpiar($entrada['domicilio'] ?? '', 200),
    'telefono'         => limpiar($entrada['telefono'] ?? '', 20),
    'correo'           => mb_strtolower(trim(limpiar($entrada['correo'] ?? '', 120))),
    'menor'            => filter_var($entrada['menor'] ?? false, FILTER_VALIDATE_BOOLEAN),
    'apoderado'        => limpiar($entrada['apoderado'] ?? '', 100),
    'bien'             => in_array($entrada['bien'] ?? '', ['Servicio', 'Producto'], true) ? $entrada['bien'] : '',
    'monto'            => preg_match('/^\d{1,9}([.,]\d{1,2})?$/', (string) ($entrada['monto'] ?? '')) ? str_replace(',', '.', (string) $entrada['monto']) : '',
    'descripcion_bien' => limpiar($entrada['descripcion_bien'] ?? '', 200),
    'tipo'             => in_array($entrada['tipo'] ?? '', ['Reclamo', 'Queja'], true) ? $entrada['tipo'] : '',
    'detalle'          => $parrafo($entrada['detalle'] ?? '', 3000),
    'pedido'           => $parrafo($entrada['pedido'] ?? '', 1500),
    'acepta_correo'    => filter_var($entrada['acepta_correo'] ?? false, FILTER_VALIDATE_BOOLEAN),
];

$errores = [];
if (mb_strlen($hoja['nombre']) < 3)                        $errores[] = 'nombre';
if ($hoja['tipo_documento'] === '')                        $errores[] = 'tipo_documento';
if (strlen($hoja['documento']) < 6)                        $errores[] = 'documento';
if ($hoja['domicilio'] === '')                             $errores[] = 'domicilio';
if (strlen((string) preg_replace('/\D/', '', $hoja['telefono'])) < 6) $errores[] = 'telefono';
if (!correoValido($hoja['correo']))                        $errores[] = 'correo';
if ($hoja['menor'] && mb_strlen($hoja['apoderado']) < 3)   $errores[] = 'apoderado';
if ($hoja['bien'] === '')                                  $errores[] = 'bien';
if ($hoja['descripcion_bien'] === '')                      $errores[] = 'descripcion_bien';
if ($hoja['tipo'] === '')                                  $errores[] = 'tipo';
if (mb_strlen($hoja['detalle']) < 10)                      $errores[] = 'detalle';
if (mb_strlen($hoja['pedido']) < 5)                        $errores[] = 'pedido';
if (!filter_var($entrada['consentimiento'] ?? false, FILTER_VALIDATE_BOOLEAN)) $errores[] = 'consentimiento';
if ($errores) {
    responder(422, ['ok' => false, 'error' => 'Revisa los campos marcados', 'campos' => $errores]);
}

// ── Número correlativo, bajo bloqueo: dos hojas a la vez no comparten número ─
$carpeta = $carpetaConfig . '/../storage/reclamos';
if (!is_dir($carpeta) && !@mkdir($carpeta, 0750, true)) {
    responder(500, ['ok' => false, 'error' => 'No pudimos registrar tu hoja en este momento']);
}
$zona  = new DateTimeZone('America/Lima');
$ahora = new DateTimeImmutable('now', $zona);
$f = @fopen($carpeta . '/contador', 'c+');
if (!$f) {
    responder(500, ['ok' => false, 'error' => 'No pudimos registrar tu hoja en este momento']);
}
flock($f, LOCK_EX);
$siguiente = (int) stream_get_contents($f) + 1;
rewind($f);
ftruncate($f, 0);
fwrite($f, (string) $siguiente);
fflush($f);
flock($f, LOCK_UN);
fclose($f);

$numero = sprintf('CAPSUR-%s-%06d', $ahora->format('Y'), $siguiente);
$hoja = [
    'numero'      => $numero,
    'fecha'       => $ahora->format('Y-m-d H:i:s'),
    'vence'       => sumarDiasHabiles($ahora, 15)->format('Y-m-d'),
    'estado'      => 'pendiente',
    'ip'          => $ip,
] + $hoja;

if (@file_put_contents("{$carpeta}/{$numero}.json", json_encode($hoja, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) === false) {
    responder(500, ['ok' => false, 'error' => 'No pudimos registrar tu hoja en este momento']);
}

// ── Copia por correo al consumidor y al equipo ─────────────────────────────
if (trim(env('SMTP_HOST')) !== '' && trim(env('MAIL_TO')) !== '') {
    $e = static fn (string $t): string => nl2br(htmlspecialchars($t, ENT_QUOTES, 'UTF-8'));
    $filas = [
        'Número'            => $numero,
        'Fecha'             => $hoja['fecha'],
        'Proveedor'         => env('EMPRESA_RAZON_SOCIAL', 'Grupo CAPSUR') . ' · RUC ' . env('EMPRESA_RUC', '—'),
        'Consumidor'        => $hoja['nombre'] . ($hoja['menor'] ? ' (menor de edad; apoderado: ' . $hoja['apoderado'] . ')' : ''),
        'Documento'         => $hoja['tipo_documento'] . ' ' . $hoja['documento'],
        'Domicilio'         => $hoja['domicilio'],
        'Teléfono'          => $hoja['telefono'],
        'Correo'            => $hoja['correo'],
        'Bien contratado'   => $hoja['bien'] . ': ' . $hoja['descripcion_bien'] . ($hoja['monto'] !== '' ? ' · S/ ' . $hoja['monto'] : ''),
        'Tipo'              => $hoja['tipo'],
        'Detalle'           => $hoja['detalle'],
        'Pedido'            => $hoja['pedido'],
        'Plazo de respuesta' => 'Hasta el ' . $hoja['vence'] . ' (15 días hábiles)',
    ];
    $html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1a202c">'
        . '<h1 style="font-size:18px;color:#0A2A63">Hoja de reclamación ' . $e($numero) . '</h1><table style="width:100%;border-collapse:collapse">';
    foreach ($filas as $k => $v) {
        $html .= '<tr><td style="padding:8px;border-bottom:1px solid #edf2f7;color:#4a5568;width:160px;vertical-align:top">' . $e($k)
            . '</td><td style="padding:8px;border-bottom:1px solid #edf2f7">' . $e($v) . '</td></tr>';
    }
    $html .= '</table><p style="font-size:12px;color:#718096">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p></div>';
    $texto = implode("\n", array_map(static fn ($k, $v) => "{$k}: {$v}", array_keys($filas), $filas));

    try {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = env('SMTP_HOST');
        $mail->SMTPAuth   = true;
        $mail->Username   = env('SMTP_USER');
        $mail->Password   = env('SMTP_PASS');
        $mail->Port       = (int) env('SMTP_PORT', '587');
        $mail->SMTPSecure = $mail->Port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->CharSet    = 'UTF-8';
        $mail->Timeout    = 15;
        $mail->setFrom(env('MAIL_FROM'), env('MAIL_FROM_NOMBRE', 'CAPSUR'));
        $mail->isHTML(true);
        $mail->Body    = $html;
        $mail->AltBody = $texto;

        // Al equipo
        foreach (array_filter(array_map('trim', explode(',', env('RECLAMOS_TO') ?: env('MAIL_TO')))) as $destino) {
            $mail->addAddress($destino);
        }
        $mail->addReplyTo($hoja['correo'], $hoja['nombre']);
        $mail->Subject = "Libro de Reclamaciones: {$numero} ({$hoja['tipo']})";
        $mail->send();

        // Copia al consumidor
        $mail->clearAllRecipients();
        $mail->clearReplyTos();
        $mail->addAddress($hoja['correo'], $hoja['nombre']);
        $mail->Subject = "Copia de tu hoja de reclamación {$numero}";
        $mail->send();
    } catch (Exception $err) {
        error_log('CAPSUR: no salió el correo del reclamo ' . $numero . ' — ' . ($mail->ErrorInfo ?? ''));
    }
} else {
    error_log("CAPSUR: reclamo {$numero} guardado; sin SMTP no salió la copia por correo");
}

responder(200, ['ok' => true, 'numero' => $numero]);
