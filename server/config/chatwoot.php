<?php
/**
 * Registro de leads en Chatwoot por su API.
 *
 * enviar.php lo llama después de guardar el CSV y antes del correo interno.
 * Si CHATWOOT_TOKEN está vacío, no hace nada. Si Chatwoot falla, el lead queda
 * en storage/chatwoot-pendientes/ y lo retoma reintentar-chatwoot.php (cron) o
 * api/reintentar.php (Docker, llamado por n8n).
 *
 * Necesita bootstrap-min.php cargado antes (usa env()) y la extensión cURL.
 * Este archivo vive FUERA de public_html en producción.
 */
declare(strict_types=1);

/**
 * Reparto por área: id del asesor en Chatwoot => porcentaje. Son las mismas
 * cuotas del nodo "Asignar por porcentaje" del flujo de WhatsApp; si cambian
 * allá, hay que cambiarlas aquí. Las áreas sin fila propia usan GEN.
 */
const CW_REPARTO = [
    'COMP' => [123 => 40, 75 => 40, 166 => 20], // Franceska, Gianina, Sofia (SIS)
    'MIN'  => [123 => 40, 75 => 40, 165 => 20], // Franceska, Gianina, Sergio (MATPEL)
    'IND'  => [123 => 40, 75 => 40, 168 => 20], // Franceska, Gianina, Camila (CECAVA)
    'TUR'  => [123 => 40, 75 => 40, 167 => 20], // Franceska, Gianina, Marco (AVANTI)
    'GEN'  => [123 => 40, 75 => 60],            // Franceska, Gianina
];

/** Códigos de área que tienen etiqueta propia (area_comp, area_min…). */
const CW_AREAS = ['MIN', 'COMP', 'ADM', 'MKT', 'NEG', 'TUR', 'SAL', 'EDU', 'IND', 'GEN'];

/** Reintentos de la cola antes de dar el lead por fallido (uno cada 15 min ≈ 3 h). */
const CW_MAX_REINTENTOS = 12;

/** Segundos que se espera cada llamada a Chatwoot. */
const CW_LIMITE_SEGUNDOS = 10;

/** ¿Está encendida la integración? Basta con que haya token. */
function cw_activo(): bool
{
    return env('CHATWOOT_TOKEN') !== '';
}

/** Carpeta de storage/ (o una subcarpeta, que se crea si falta). */
function cw_carpeta(string $sub = ''): string
{
    $carpeta = __DIR__ . '/../storage' . ($sub !== '' ? '/' . $sub : '');
    if (!is_dir($carpeta)) {
        @mkdir($carpeta, 0755, true);
    }
    return $carpeta;
}

/**
 * Una llamada a la API de la cuenta. Devuelve el JSON de la respuesta y lanza
 * RuntimeException si no hay conexión, se pasa del límite o responde un error.
 * En GET, $datos va como query; en el resto, como cuerpo JSON.
 */
function cw_llamar(string $metodo, string $ruta, array $datos = []): array
{
    $base   = rtrim(env('CHATWOOT_URL'), '/');
    $cuenta = env('CHATWOOT_ACCOUNT_ID');
    if ($base === '' || !ctype_digit($cuenta)) {
        throw new RuntimeException('faltan CHATWOOT_URL o CHATWOOT_ACCOUNT_ID');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('PHP no tiene la extensión cURL');
    }

    $url = "{$base}/api/v1/accounts/{$cuenta}{$ruta}";
    if ($metodo === 'GET' && $datos) {
        $url .= '?' . http_build_query($datos);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => CW_LIMITE_SEGUNDOS,
        CURLOPT_HTTPHEADER     => [
            'api_access_token: ' . env('CHATWOOT_TOKEN'),
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);
    if ($metodo !== 'GET') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($datos, JSON_UNESCAPED_UNICODE));
    }

    $cuerpo = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $fallo  = curl_error($ch);

    // En el mensaje van el método y la ruta, nunca la query: ahí viajan el
    // teléfono y el correo de la persona, y esto termina en el log de errores.
    if ($cuerpo === false) {
        throw new RuntimeException("{$metodo} {$ruta}: {$fallo}");
    }
    if ($codigo < 200 || $codigo >= 300) {
        throw new RuntimeException("{$metodo} {$ruta}: HTTP {$codigo}");
    }

    $json = json_decode((string) $cuerpo, true);
    return is_array($json) ? $json : [];
}

/**
 * Teléfono en E.164 (+51987654321), que es como lo guarda Chatwoot cuando la
 * persona escribe por WhatsApp. Un celular de 9 dígitos se toma como peruano.
 * Devuelve '' si no se puede saber el país: mejor sin teléfono que con uno mal.
 */
function cw_telefono(string $whatsapp): string
{
    $conMas  = str_starts_with(trim($whatsapp), '+');
    $digitos = preg_replace('/\D+/', '', $whatsapp) ?? '';

    if (!$conMas && str_starts_with($digitos, '00')) {
        $digitos = substr($digitos, 2);
        $conMas  = true;
    }
    if (strlen($digitos) === 9 && $digitos[0] === '9') {
        return '+51' . $digitos;
    }
    if (strlen($digitos) === 11 && str_starts_with($digitos, '519')) {
        return '+' . $digitos;
    }
    if ($conMas && strlen($digitos) >= 8 && strlen($digitos) <= 15 && $digitos[0] !== '0') {
        return '+' . $digitos;
    }
    return '';
}

/**
 * Busca la ficha de la persona: primero por teléfono y, si no, por correo.
 * La búsqueda de Chatwoot es por coincidencia parcial, así que se exige que el
 * campo sea exactamente el buscado.
 */
function cw_buscar_contacto(string $telefono, string $correo): ?array
{
    foreach ([['phone_number', $telefono], ['email', mb_strtolower($correo)]] as [$campo, $valor]) {
        if ($valor === '') {
            continue;
        }
        $respuesta = cw_llamar('GET', '/contacts/search', ['q' => $valor]);
        foreach ($respuesta['payload'] ?? [] as $contacto) {
            if (is_array($contacto) && !empty($contacto['id'])
                && mb_strtolower((string) ($contacto[$campo] ?? '')) === $valor) {
                return $contacto;
            }
        }
    }
    return null;
}

/**
 * De dónde vino el lead, con el mismo criterio que la referencia de WhatsApp
 * (src/lib/origen.js). Devuelve [valor del atributo origen_lead, texto para la nota].
 */
function cw_origen(array $utm, string $pagina): array
{
    $fuente = mb_strtolower($utm['utm_source'] ?? '');
    $medio  = mb_strtolower($utm['utm_medium'] ?? '');

    if (str_contains($fuente, 'email') || str_contains($medio, 'email')) {
        return ['email_marketing', 'Email marketing'];
    }
    parse_str((string) parse_url($pagina, PHP_URL_QUERY), $query);
    if (!empty($query['fbclid']) || preg_match('/^(facebook|fb|instagram|ig|meta)$/', $fuente)) {
        return ['meta_ads', 'Meta Ads'];
    }
    return ['formulario_web', 'Formulario web'];
}

/** Etiquetas de la conversación. Tienen que existir en Chatwoot para verse. */
function cw_etiquetas(array $lead, bool $diferida): array
{
    $area      = in_array($lead['area_codigo'], CW_AREAS, true) ? $lead['area_codigo'] : 'GEN';
    $etiquetas = ['formulario_web', 'lead_nuevo', 'area_' . strtolower($area)];

    if (cw_origen($lead['utm'], $lead['pagina'])[0] === 'email_marketing') {
        $etiquetas[] = 'email_marketing';
        $contenido   = mb_strtolower($lead['utm']['utm_content'] ?? '');
        if (preg_match('/^correo_[1-9]$/', $contenido)) {
            $etiquetas[] = $contenido;
        }
    }
    if ($diferida) {
        $etiquetas[] = 'por_asignar';
    }
    return $etiquetas;
}

/** La nota privada que ve el asesor al abrir la conversación. */
function cw_nota(array $lead, string $telefono): string
{
    $utm    = $lead['utm'];
    $origen = implode(' · ', array_filter([
        cw_origen($utm, $lead['pagina'])[1],
        $utm['utm_campaign'] ?? '',
        $utm['utm_content'] ?? '',
    ]));
    $whatsapp = $telefono !== '' ? $telefono : ($lead['whatsapp'] !== '' ? $lead['whatsapp'] : 'no lo dejó');

    $cierre = $lead['whatsapp'] !== ''
        ? "La persona llenó el formulario; no escribió por chat. Para contactarla\n"
          . "por WhatsApp, búscala en la bandeja Grupo CAPSUR: si no escribió ahí,\n"
          . 'se necesita una plantilla aprobada.'
        : "La persona llenó el formulario; no escribió por chat ni dejó WhatsApp.\n"
          . 'Contáctala por correo.';

    return "NUEVO LEAD – FORMULARIO WEB CAPSUR\n\n"
        . "Origen: {$origen}\n"
        . "Fecha: {$lead['fecha']} (Lima)\n\n"
        . "Nombre: {$lead['nombre']}\n"
        . "Correo: {$lead['correo']}\n"
        . "WhatsApp: {$whatsapp}\n\n"
        . "Área de interés: {$lead['area']}\n"
        . "Qué busca: {$lead['objetivo']}\n"
        . "Cuándo quiere empezar: {$lead['inicio']}\n\n"
        . 'Autoriza marketing: ' . ($lead['marketing'] ? 'sí' : 'no') . "\n\n"
        . $cierre;
}

/**
 * A quién le toca el lead. Lleva la cuenta del día en storage/reparto-AAAA-MM-DD.json
 * y elige al asesor más atrasado respecto de su cuota; en un empate gana el
 * primero de la tabla. Con 40/40/20, diez leads quedan 4/4/2.
 */
function cw_elegir_asesor(string $areaCodigo): ?int
{
    $grupo  = isset(CW_REPARTO[$areaCodigo]) ? $areaCodigo : 'GEN';
    $cuotas = CW_REPARTO[$grupo];
    $suma   = array_sum($cuotas);
    $hoy    = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d');

    $manejador = @fopen(cw_carpeta() . "/reparto-{$hoy}.json", 'c+');
    if (!$manejador) {
        error_log('CAPSUR: no se pudo abrir el reparto del día; el lead va sin asesor');
        return null;
    }
    flock($manejador, LOCK_EX);

    $conteo   = json_decode((string) stream_get_contents($manejador), true);
    $conteo   = is_array($conteo) ? $conteo : [];
    $delGrupo = is_array($conteo[$grupo] ?? null) ? $conteo[$grupo] : [];
    $total    = array_sum($delGrupo) + 1;

    // Atraso = lo que le correspondería con este lead incluido, menos lo que
    // ya tiene. Se compara multiplicado por $suma para no usar decimales.
    $elegido = null;
    $mayor   = PHP_INT_MIN;
    foreach ($cuotas as $asesor => $cuota) {
        $atraso = $total * $cuota - (int) ($delGrupo[$asesor] ?? 0) * $suma;
        if ($atraso > $mayor) {
            $mayor   = $atraso;
            $elegido = $asesor;
        }
    }

    $delGrupo[$elegido] = (int) ($delGrupo[$elegido] ?? 0) + 1;
    $conteo[$grupo]     = $delGrupo;

    rewind($manejador);
    ftruncate($manejador, 0);
    fwrite($manejador, (string) json_encode($conteo));
    fflush($manejador);
    flock($manejador, LOCK_UN);
    fclose($manejador);

    return $elegido;
}

/**
 * Registra un lead recién llegado. Devuelve true si quedó en Chatwoot y false
 * si quedó en la cola (o si ese envio_id ya se había registrado o encolado).
 *
 * $lead: envio_id, fecha, nombre, correo, whatsapp, area, objetivo, inicio,
 * area_codigo, area_valor, objetivo_valor, inicio_valor, marketing (bool),
 * version, pagina y utm (los cuatro utm_*).
 */
function cw_registrar(array $lead): bool
{
    $id      = $lead['envio_id'];
    $archivo = cw_carpeta('chatwoot-pendientes') . "/{$id}.json";

    // Un reintento del mismo envío (falló el correo y la persona volvió a
    // enviar) no abre otra conversación.
    if (is_file(cw_carpeta('chatwoot-hechos') . "/{$id}") || is_file($archivo)
        || is_file(substr($archivo, 0, -5) . '.fallido')) {
        return false;
    }

    // Primero a la cola y después el intento: si el proceso muere a medias,
    // el lead sigue ahí para el reintento. Se escribe aparte y se renombra
    // para que el reintento nunca lea un archivo a medio escribir.
    $trabajo = ['envio_id' => $id, 'intentos' => 0, 'ultimo_error' => '', 'lead' => $lead];
    $temporal = $archivo . '.tmp';
    if (@file_put_contents($temporal, json_encode($trabajo, JSON_UNESCAPED_UNICODE)) === false
        || !@rename($temporal, $archivo)) {
        error_log("CAPSUR: no se pudo encolar el lead {$id} para Chatwoot");
        return false;
    }

    return cw_procesar($archivo, false) === 'hecho';
}

/**
 * Ejecuta (o retoma) las llamadas de un lead de la cola. Guarda el avance
 * después de cada paso, así que un reintento sigue donde quedó el anterior.
 * Devuelve 'hecho', 'pendiente', 'fallido' u 'ocupado' (otro proceso lo tiene).
 */
function cw_procesar(string $archivo, bool $esReintento): string
{
    $manejador = @fopen($archivo, 'r+');
    if (!$manejador) {
        return 'ocupado';
    }
    if (!flock($manejador, LOCK_EX | LOCK_NB)) {
        fclose($manejador);
        return 'ocupado';
    }

    $t = json_decode((string) stream_get_contents($manejador), true);
    if (!is_array($t) || !is_array($t['lead'] ?? null) || empty($t['envio_id'])) {
        fclose($manejador);
        error_log('CAPSUR: archivo de la cola de Chatwoot ilegible — ' . basename($archivo));
        return 'ocupado';
    }
    if (!empty($t['hecho'])) {
        // Lo terminó otro proceso mientras este esperaba para abrirlo.
        fclose($manejador);
        return 'hecho';
    }

    $guardar = static function () use (&$t, $manejador): void {
        rewind($manejador);
        ftruncate($manejador, 0);
        fwrite($manejador, (string) json_encode($t, JSON_UNESCAPED_UNICODE));
        fflush($manejador);
    };

    $lead     = $t['lead'];
    $id       = $t['envio_id'];
    $bandeja  = (int) env('CHATWOOT_INBOX_ID');
    $diferida = strtolower(env('CHATWOOT_ASIGNACION', 'inmediata')) === 'diferida';
    $telefono = cw_telefono($lead['whatsapp']);

    try {
        if ($bandeja < 1) {
            throw new RuntimeException('falta CHATWOOT_INBOX_ID');
        }

        // ── 1 y 2. La ficha: se reutiliza si existe, se crea si no ─────────
        if (empty($t['contacto_id'])) {
            $consentimiento = [
                'consentimiento_datos'     => 'si',
                'consentimiento_marketing' => $lead['marketing'] ? 'si' : 'no',
                'version_consentimiento'   => $lead['version'],
            ];
            $contacto = cw_buscar_contacto($telefono, $lead['correo']);

            if ($contacto !== null) {
                // Solo el consentimiento: el nombre y lo que el asesor ya
                // corrigió no se tocan. El teléfono se añade si no tenía.
                $cambios = ['custom_attributes' => $consentimiento];
                if ($telefono !== '' && empty($contacto['phone_number'])) {
                    $cambios['phone_number'] = $telefono;
                }
                cw_llamar('PUT', "/contacts/{$contacto['id']}", $cambios);
                $t['contacto_id'] = (int) $contacto['id'];
            } else {
                $nuevo = ['name' => $lead['nombre'], 'email' => $lead['correo']];
                if ($telefono !== '') {
                    $nuevo['phone_number'] = $telefono;
                }
                $respuesta = cw_llamar('POST', '/contacts', $nuevo + ['custom_attributes' => $consentimiento]);
                $t['contacto_id'] = (int) ($respuesta['payload']['contact']['id'] ?? $respuesta['payload']['id'] ?? $respuesta['id'] ?? 0);
                if ($t['contacto_id'] < 1) {
                    throw new RuntimeException('POST /contacts: respuesta sin id');
                }
            }
            $guardar();
        }

        // ── 3 y 4. La conversación en la bandeja API ───────────────────────
        if (empty($t['conversacion_id'])) {
            // Si un intento anterior llegó a pedirla y se cortó la respuesta,
            // puede que exista: se busca antes de crear otra.
            if (!empty($t['conversacion_pedida'])) {
                $respuesta = cw_llamar('GET', "/contacts/{$t['contacto_id']}/conversations");
                foreach ($respuesta['payload'] ?? [] as $conversacion) {
                    if (($conversacion['custom_attributes']['envio_id'] ?? '') === $id) {
                        $t['conversacion_id'] = (int) $conversacion['id'];
                        break;
                    }
                }
            }

            if (empty($t['conversacion_id'])) {
                cw_llamar('POST', "/contacts/{$t['contacto_id']}/contact_inboxes", [
                    'inbox_id'  => $bandeja,
                    'source_id' => "form-{$id}",
                ]);

                // El asesor se elige una vez y se recuerda entre reintentos.
                if (!$diferida && !array_key_exists('asesor_id', $t)) {
                    $t['asesor_id'] = cw_elegir_asesor($lead['area_codigo']);
                }
                $t['conversacion_pedida'] = true;
                $guardar();

                $utm          = $lead['utm'];
                $conversacion = [
                    'source_id'         => "form-{$id}",
                    'inbox_id'          => $bandeja,
                    'contact_id'        => $t['contacto_id'],
                    'status'            => 'open',
                    'custom_attributes' => array_filter([
                        'origen_lead'  => cw_origen($utm, $lead['pagina'])[0],
                        'utm_source'   => $utm['utm_source'] ?? '',
                        'utm_medium'   => $utm['utm_medium'] ?? '',
                        'utm_campaign' => $utm['utm_campaign'] ?? '',
                        'utm_content'  => $utm['utm_content'] ?? '',
                        'area_interes' => $lead['area_valor'],
                        'objetivo'     => $lead['objetivo_valor'],
                        'inicio'       => $lead['inicio_valor'],
                        'envio_id'     => $id,
                    ], static fn ($valor) => $valor !== ''),
                ];
                if (!$diferida && !empty($t['asesor_id'])) {
                    $conversacion['assignee_id'] = $t['asesor_id'];
                }

                $respuesta = cw_llamar('POST', '/conversations', $conversacion);
                $t['conversacion_id'] = (int) ($respuesta['id'] ?? 0);
                if ($t['conversacion_id'] < 1) {
                    throw new RuntimeException('POST /conversations: respuesta sin id');
                }
            }
            $guardar();
        }

        // ── 5. La nota privada ─────────────────────────────────────────────
        if (empty($t['nota'])) {
            cw_llamar('POST', "/conversations/{$t['conversacion_id']}/messages", [
                'content'      => cw_nota($lead, $telefono),
                'message_type' => 'outgoing',
                'private'      => true,
            ]);
            $t['nota'] = true;
            $guardar();
        }

        // ── 6. Las etiquetas ───────────────────────────────────────────────
        cw_llamar('POST', "/conversations/{$t['conversacion_id']}/labels", [
            'labels' => cw_etiquetas($lead, $diferida),
        ]);

        // Hecho: queda la marca del envio_id y el lead sale de la cola.
        @file_put_contents(cw_carpeta('chatwoot-hechos') . "/{$id}", (string) $t['conversacion_id']);
        $t['hecho'] = true;
        $guardar();
        fclose($manejador);
        @unlink($archivo);
        return 'hecho';
    } catch (Throwable $error) {
        $t['ultimo_error'] = $error->getMessage();
        if ($esReintento) {
            $t['intentos'] = (int) ($t['intentos'] ?? 0) + 1;
        }
        $guardar();
        fclose($manejador);

        if ($t['intentos'] >= CW_MAX_REINTENTOS) {
            @rename($archivo, substr($archivo, 0, -5) . '.fallido');
            error_log("CAPSUR: Chatwoot FALLIDO tras {$t['intentos']} reintentos, lead {$id} — {$t['ultimo_error']}");
            return 'fallido';
        }
        error_log("CAPSUR: Chatwoot en cola, lead {$id} — {$t['ultimo_error']}");
        return 'pendiente';
    }
}

/**
 * Reintenta lo que haya en la cola, del más antiguo al más nuevo. Si se acaba
 * el tiempo, lo que falta queda para la próxima vuelta sin contar como intento.
 * Devuelve cuántos quedaron en cada estado.
 */
function cw_reintentar_pendientes(int $segundos = 45): array
{
    $resumen  = ['hecho' => 0, 'pendiente' => 0, 'fallido' => 0, 'ocupado' => 0, 'sin_tiempo' => 0];
    $archivos = glob(cw_carpeta('chatwoot-pendientes') . '/*.json') ?: [];
    usort($archivos, static fn ($a, $b) => (int) @filemtime($a) <=> (int) @filemtime($b));

    $inicio = time();
    foreach ($archivos as $archivo) {
        if (time() - $inicio >= $segundos) {
            $resumen['sin_tiempo']++;
            continue;
        }
        $resumen[cw_procesar($archivo, true)]++;
    }

    // Las cuentas del reparto de días pasados ya no sirven.
    foreach (glob(cw_carpeta() . '/reparto-*.json') ?: [] as $viejo) {
        if (time() - (int) @filemtime($viejo) > 7 * 86400) {
            @unlink($viejo);
        }
    }

    return $resumen;
}
