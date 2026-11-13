<?php
/**
 * Utilidades compartidas por todos los endpoints: variables de entorno,
 * limpieza de datos, respuestas JSON y límite por IP.
 *
 * No carga PHPMailer: solo el endpoint del formulario lo necesita.
 * Este archivo vive FUERA de public_html en producción.
 */
declare(strict_types=1);

// Los avisos de PHP van al registro del servidor, nunca al visitante: en un
// hosting que los muestra delatarían rutas del servidor y romperían el JSON.
if (PHP_SAPI !== 'cli') {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

// ── Variables de entorno ───────────────────────────────────────────────────
$raizProyecto = dirname(__DIR__, 2);
$esProyectoLocal = is_file($raizProyecto . '/vite.config.js');
$rutasEnv = $esProyectoLocal
    ? [$raizProyecto . '/.env', __DIR__ . '/.env']
    : [__DIR__ . '/.env'];
$rutaEnv = null;

foreach ($rutasEnv as $rutaCandidata) {
    if (is_readable($rutaCandidata)) {
        $rutaEnv = $rutaCandidata;
        break;
    }
}

if ($rutaEnv !== null) {
    define('CAPSUR_ENV_CARGADO', true);
    foreach (file($rutaEnv, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $linea = trim($linea);
        if ($linea === '' || str_starts_with($linea, '#')) {
            continue;
        }
        [$clave, $valor] = array_pad(explode('=', $linea, 2), 2, '');
        $clave = trim($clave);
        $valor = trim($valor, " \t\n\r\0\x0B\"'");
        if ($clave !== '') {
            $_ENV[$clave] = $valor;
        }
    }
}

// En Docker (EasyPanel) no hay .env: las variables llegan por el entorno del
// contenedor. Basta con una propia del proyecto para dar la configuración por
// cargada; sin SMTP el formulario igual guarda el lead (api/enviar.php).
if (!defined('CAPSUR_ENV_CARGADO')) {
    foreach (['SMTP_HOST', 'MAIL_TO', 'ORIGENES_PERMITIDOS', 'ADMIN_USUARIO', 'CHATWOOT_TOKEN'] as $clave) {
        if (getenv($clave) !== false) {
            define('CAPSUR_ENV_CARGADO', true);
            break;
        }
    }
}

// ── Utilidades ─────────────────────────────────────────────────────────────

/** Valor del .env (o, si no está ahí, del entorno del contenedor) con respaldo. */
function env(string $clave, string $porDefecto = ''): string
{
    if (isset($_ENV[$clave])) {
        return $_ENV[$clave];
    }
    $valor = getenv($clave);
    return $valor !== false ? $valor : $porDefecto;
}

/**
 * Deja el texto listo para usarse sin riesgo.
 * Quita etiquetas y, sobre todo, los saltos de línea: son los que permiten
 * inyectar cabeceras extra en un correo.
 */
function limpiar(mixed $valor, int $maximo = 200): string
{
    $texto = is_scalar($valor) ? (string) $valor : '';
    // UTF-8 roto haría fallar json_encode más adelante (y con él, la respuesta).
    $texto = mb_scrub($texto, 'UTF-8');
    $texto = str_ireplace(['%0a', '%0d'], ' ', $texto);
    // Saltos de línea y demás caracteres de control.
    $texto = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $texto) ?? '';
    // Invisibles y de dirección de escritura: sirven para disfrazar un texto.
    $texto = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2028}\x{2029}\x{2066}-\x{2069}\x{FEFF}]/u', '', $texto) ?? '';
    $texto = strip_tags($texto);
    return mb_substr(trim($texto), 0, $maximo);
}

/** El valor como texto, tal cual llega; '' si no es un valor simple (un arreglo en "?q[]=x", por ejemplo). */
function texto(mixed $valor): string
{
    return is_scalar($valor) ? (string) $valor : '';
}

/**
 * Solo peticiones del propio sitio (ORIGENES_PERMITIDOS). Si el navegador no
 * manda Origin se usa el Referer; si no llega ninguno, se rechaza: los
 * navegadores siempre mandan al menos uno en un POST, así que su falta
 * delata un script. Con ORIGENES_PERMITIDOS vacío no se comprueba nada.
 */
function exigirOrigenPropio(): void
{
    $permitidos = array_filter(array_map('trim', explode(',', env('ORIGENES_PERMITIDOS'))));
    if (!$permitidos) {
        return;
    }
    $origen = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origen === '' || $origen === 'null') {
        $p = parse_url((string) ($_SERVER['HTTP_REFERER'] ?? ''));
        $origen = isset($p['scheme'], $p['host'])
            ? $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '')
            : '';
    }
    if (!in_array($origen, $permitidos, true)) {
        responder(403, ['ok' => false, 'error' => 'Origen no permitido']);
    }
}

/**
 * Solo JSON. Un formulario de otro sitio solo puede mandar texto plano o
 * urlencoded sin pasar por CORS: exigir JSON le cierra esa puerta.
 */
function exigirJson(): void
{
    $tipo = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($tipo !== 'application/json') {
        responder(415, ['ok' => false, 'error' => 'Se espera JSON']);
    }
}

/**
 * Reglas de validación del formulario, compartidas con el navegador
 * (src/lib/reglas.js) en reglas.json: se cambian allí y valen para los dos.
 */
function reglas(): array
{
    static $reglas = null;
    if ($reglas === null) {
        $reglas = json_decode((string) @file_get_contents(__DIR__ . '/reglas.json'), true);
        if (!is_array($reglas) || !isset($reglas['celular'], $reglas['correo'], $reglas['celularInventado'])) {
            throw new RuntimeException('CAPSUR: falta o está dañado config/reglas.json');
        }
    }
    return $reglas;
}

/** El patrón tiene que calzar con todo el valor, como el atributo pattern del navegador. */
function calzaCompleto(string $patron, string $valor): bool
{
    return preg_match('~^(?:' . $patron . ')$~u', $valor) === 1;
}

/** Celular peruano: 9 dígitos que empiezan con 9, con o sin +51, con espacios o guiones. */
function celularValido(string $celular): bool
{
    return calzaCompleto(reglas()['celular'], $celular);
}

/** Correo con dominio terminado en punto y dos letras o más (.com, .pe…). */
function correoValido(string $correo): bool
{
    return filter_var($correo, FILTER_VALIDATE_EMAIL) !== false && calzaCompleto(reglas()['correo'], $correo);
}

/**
 * Celular con el formato correcto pero evidentemente inventado: un dígito
 * repetido (911 111 111), una escalera (987 654 321, 912 345 678) o un bloque
 * repetido (987 987 987, 912 121 212, 999 888 777).
 * No prueba que el número exista: solo descarta los falsos más comunes.
 */
function celularInventado(string $celular): bool
{
    $d = preg_replace('/^51(?=\d{9}$)/', '', preg_replace('/\D/', '', $celular) ?? '') ?? '';
    if (!preg_match('/^9\d{8}$/', $d)) {
        return false;
    }
    foreach (reglas()['celularInventado'] as $patron) {
        if (calzaCompleto($patron, $d)) {
            return true;
        }
    }
    return false;
}

/**
 * Celda lista para un CSV que alguien abrirá en Excel o Google Sheets.
 * Un valor que empieza con = + - @ se ejecuta ahí como fórmula; con un
 * apóstrofo delante queda como texto. Los teléfonos y números ("+51 987…")
 * se dejan como están.
 */
function celdaCsv(mixed $valor): string
{
    $texto = is_scalar($valor) ? (string) $valor : '';
    if ($texto !== '' && strpbrk($texto[0], "=+-@\t\r") !== false && !preg_match('/^[0-9 +\-().,]+$/', $texto)) {
        return "'" . $texto;
    }
    return $texto;
}

/** Devuelve una respuesta JSON y corta la ejecución. */
function responder(int $codigo, array $cuerpo): never
{
    http_response_code($codigo);
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    exit;
}

/* ── IP del visitante ───────────────────────────────────────────────────── */

/** Rangos desde los que Cloudflare se conecta al servidor (cloudflare.com/ips). */
const RANGOS_CLOUDFLARE = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
    '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
    '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
    '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
    '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

/** La IP en su forma canónica, o '' si no es una IP. "::ffff:1.2.3.4" queda en "1.2.3.4". */
function ipNormal(string $ip): string
{
    $ip = trim($ip);
    $binario = filter_var($ip, FILTER_VALIDATE_IP) ? @inet_pton($ip) : false;
    if ($binario === false) {
        return '';
    }
    if (strlen($binario) === 16 && str_starts_with($binario, str_repeat("\0", 10) . "\xff\xff")) {
        $binario = substr($binario, 12);
    }
    return (string) inet_ntop($binario);
}

/** ¿La IP cae dentro del rango? El rango es una IP suelta o un CIDR, IPv4 o IPv6. */
function ipEnRango(string $ip, string $rango): bool
{
    [$red, $bits] = array_pad(explode('/', trim($rango), 2), 2, null);
    $a = @inet_pton($ip);
    $b = @inet_pton((string) $red);
    if ($a === false || $b === false || strlen($a) !== strlen($b)) {
        return false;
    }
    $total = strlen($a) * 8;
    $bits  = $bits === null ? $total : max(0, min($total, (int) $bits));
    $enteros = intdiv($bits, 8);
    if (substr($a, 0, $enteros) !== substr($b, 0, $enteros)) {
        return false;
    }
    $resto = $bits % 8;
    if ($resto === 0) {
        return true;
    }
    $mascara = (0xFF << (8 - $resto)) & 0xFF;
    return (ord($a[$enteros]) & $mascara) === (ord($b[$enteros]) & $mascara);
}

function ipEnRangos(string $ip, array $rangos): bool
{
    foreach ($rangos as $rango) {
        if (ipEnRango($ip, $rango)) {
            return true;
        }
    }
    return false;
}

/**
 * Proxys propios: el de Docker/EasyPanel (Traefik) y el de un hosting llegan
 * siempre desde una dirección privada. PROXIES_CONFIANZA suma otros (IPs o
 * rangos CIDR separados por coma) si el proxy tuviera IP pública.
 */
function proxiesDeConfianza(): array
{
    static $rangos = null;
    if ($rangos === null) {
        $rangos = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128', 'fc00::/7'];
        foreach (explode(',', env('PROXIES_CONFIANZA')) as $extra) {
            if (trim($extra) !== '') {
                $rangos[] = trim($extra);
            }
        }
    }
    return $rangos;
}

/**
 * IP real del visitante.
 *
 * X-Forwarded-For y CF-Connecting-IP las escribe quien hace la petición, así
 * que solo se creen cuando la conexión viene de un proxy propio o de
 * Cloudflare. Si no, cualquiera se inventaría una IP distinta en cada
 * petición y se saltaría los límites del formulario y del panel.
 *
 * La cadena de X-Forwarded-For se recorre de derecha a izquierda: cada proxy
 * de confianza responde por la IP que anotó, y la primera que no es un proxy
 * es el visitante.
 */
function ipVisitante(): string
{
    $actual = ipNormal((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($actual === '') {
        return '0.0.0.0';
    }
    $cadena = array_filter(array_map('trim', explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))));

    while (true) {
        if (ipEnRangos($actual, RANGOS_CLOUDFLARE)) {
            $deCloudflare = ipNormal((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
            return $deCloudflare !== '' ? $deCloudflare : $actual;
        }
        if (!ipEnRangos($actual, proxiesDeConfianza())) {
            return $actual;
        }
        $anterior = ipNormal((string) array_pop($cadena));
        if ($anterior === '') {
            return $actual; // no hay más saltos, o el siguiente no es una IP
        }
        $actual = $anterior;
    }
}

/**
 * La IP tal como cuenta para los límites. En IPv6 una sola conexión tiene
 * millones de direcciones (todo un /64), así que el límite va por ese bloque.
 */
function ipParaLimite(string $ip): string
{
    $binario = @inet_pton($ip);
    if ($binario !== false && strlen($binario) === 16) {
        return inet_ntop(substr($binario, 0, 8) . str_repeat("\0", 8)) . '/64';
    }
    return $ip;
}

/**
 * Columnas de storage/leads.csv, en orden. Las seis últimas se sumaron con la
 * integración de Chatwoot; las filas anteriores tienen solo las doce primeras
 * y el panel las sigue leyendo con la cabecera del propio archivo.
 */
const COLUMNAS_LEADS = [
    'fecha', 'nombre', 'email', 'whatsapp', 'area', 'objetivo', 'inicio',
    'consiente', 'marketing', 'version_consentimiento', 'ip', 'pagina',
    'envio_id', 'area_codigo', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
    'programa',
];

/**
 * Origen del lead: los campos UTM que manda el formulario o, si faltan,
 * los que trae la URL de la página (?utm_source=…).
 */
function utmDe(array $entrada, string $pagina): array
{
    parse_str((string) parse_url($pagina, PHP_URL_QUERY), $deLaUrl);
    $utm = [];
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as $campo) {
        $valor = limpiar($entrada[$campo] ?? '', 100);
        if ($valor === '') {
            $valor = limpiar($deLaUrl[$campo] ?? '', 100);
        }
        $utm[$campo] = $valor;
    }
    return $utm;
}

/**
 * Convierte un nombre al formato de archivo: minúsculas, sin tildes y con
 * guiones bajos.  "Magíster Capacítate" → "magister_capacitate"
 */
function aNombreArchivo(string $texto): string
{
    $acentos = [
        'á'=>'a','à'=>'a','ä'=>'a','â'=>'a','ã'=>'a','å'=>'a',
        'é'=>'e','è'=>'e','ë'=>'e','ê'=>'e',
        'í'=>'i','ì'=>'i','ï'=>'i','î'=>'i',
        'ó'=>'o','ò'=>'o','ö'=>'o','ô'=>'o','õ'=>'o',
        'ú'=>'u','ù'=>'u','ü'=>'u','û'=>'u',
        'ñ'=>'n','ç'=>'c',
    ];

    $texto = mb_strtolower(trim($texto), 'UTF-8');
    $texto = strtr($texto, $acentos);
    $texto = preg_replace('/[^a-z0-9]+/u', '_', $texto) ?? '';
    $texto = trim($texto, '_');

    return mb_substr($texto, 0, 60);
}

/* ── Sesión del panel ───────────────────────────────────────────────────── */

/**
 * Abre la sesión del panel de administración con la cookie endurecida.
 * La comparten admin/index.php, admin/metricas.php y api/metricas.php
 * (que entrega los puntos del mapa de calor solo a quien tiene sesión).
 */
function sesionPanel(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    // Solo se aceptan identificadores que el servidor haya emitido, y solo por cookie.
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    // Con HTTPS, el prefijo __Host- obliga al navegador a guardarla solo para
    // este dominio exacto, por HTTPS y en la ruta /: un subdominio no puede pisarla.
    session_name($https ? '__Host-capsur_admin' : 'capsur_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    // Caduca a las 2 horas de haber entrado o a los 30 minutos sin usarla.
    $ahora = time();
    if (!empty($_SESSION['admin'])
        && ($ahora - (int) ($_SESSION['inicio'] ?? 0) > 7200 || $ahora - (int) ($_SESSION['ultimo'] ?? $ahora) > 1800)) {
        session_unset();
        session_destroy();
        session_start();
        $_SESSION['caducada'] = true;
    }
    if (!empty($_SESSION['admin'])) {
        $_SESSION['ultimo'] = $ahora;
        // Identificador nuevo cada 15 minutos: uno robado deja de servir pronto.
        if ($ahora - (int) ($_SESSION['renovado'] ?? $_SESSION['inicio'] ?? $ahora) > 900) {
            session_regenerate_id(true);
            $_SESSION['renovado'] = $ahora;
        }
    }
}

/* ── Límite de envíos por IP ────────────────────────────────────────────── */

/** Ruta del archivo que lleva la cuenta de una clave (una IP, o "panel-login:IP"…). */
function archivoLimite(string $clave): string
{
    $carpeta = __DIR__ . '/../storage/rate';
    if (!is_dir($carpeta)) {
        @mkdir($carpeta, 0755, true);
    }
    return $carpeta . '/' . hash('sha256', $clave) . '.json';
}

/** De lo leído en un archivo de límite, las marcas que siguen dentro de la ventana. */
function marcasVigentes(mixed $leido, int $ventanaSegundos): array
{
    $ahora = time();
    return array_values(array_filter(
        is_array($leido) ? $leido : [],
        static fn ($t) => is_int($t) && ($ahora - $t) < $ventanaSegundos
    ));
}

/**
 * Cuántas marcas lleva esta clave dentro de la ventana de tiempo.
 * Solo lee; no registra nada. Sirve para rechazar pronto y barato: quien
 * decide de verdad es registrarSiCabe().
 */
function enviosRecientes(string $clave, int $ventanaSegundos): int
{
    $archivo = archivoLimite($clave);
    if (!is_readable($archivo)) {
        return 0;
    }
    return count(marcasVigentes(json_decode((string) file_get_contents($archivo), true), $ventanaSegundos));
}

/**
 * Anota una marca si todavía hay cupo y dice si cabía.
 *
 * Comprobar y anotar van bajo el mismo bloqueo: con dos pasos separados,
 * veinte peticiones lanzadas a la vez pasaban todas la comprobación antes de
 * que la primera quedara anotada.
 *
 * En el formulario esto se llama SOLO cuando la solicitud pasó la validación.
 * Si se contaran también los intentos fallidos, alguien que se equivoca tres
 * veces al llenarlo quedaría bloqueado sin motivo.
 */
function registrarSiCabe(string $clave, int $ventanaSegundos, int $maximo): bool
{
    $manejador = @fopen(archivoLimite($clave), 'c+');
    if (!$manejador) {
        return true; // sin disco no hay cuenta; mejor dejar pasar que bloquear a todos
    }
    flock($manejador, LOCK_EX);
    $marcas = marcasVigentes(json_decode((string) stream_get_contents($manejador), true), $ventanaSegundos);
    $cabe   = count($marcas) < $maximo;
    if ($cabe) {
        $marcas[] = time();
        rewind($manejador);
        ftruncate($manejador, 0);
        fwrite($manejador, (string) json_encode($marcas));
        fflush($manejador);
    }
    flock($manejador, LOCK_UN);
    fclose($manejador);
    return $cabe;
}

/* ── Limpieza de storage/ ───────────────────────────────────────────────── */

/**
 * Una de cada cien llamadas barre lo que ya no sirve en storage/, para que el
 * disco no se llene con los años: cuentas de límite vencidas, marcas de envíos
 * y de Chatwoot ya resueltos, visitas viejas y el exceso de eventos.csv.
 *
 * No toca leads.csv ni la cola de Chatwoot (pendientes y .fallido).
 */
function limpiezaOcasional(): void
{
    if (random_int(1, 100) !== 1) {
        return;
    }
    $almacen = __DIR__ . '/../storage';
    $ahora   = time();
    $tope    = microtime(true) + 3; // nunca más de 3 segundos de una petición
    $dia     = 86400;
    $vidas   = [
        'rate'            => max($dia, 2 * (int) env('LIMITE_VENTANA', '900')),
        'envios'          => 30 * $dia,
        'chatwoot-hechos' => 90 * $dia,
        'visitas'         => 90 * $dia,
        'posibles'        => 90 * $dia, // sin cambios en 90 días; también las marcas .enviado
    ];
    foreach ($vidas as $carpeta => $vida) {
        $directorio = @opendir($almacen . '/' . $carpeta);
        if (!$directorio) {
            continue;
        }
        while (($nombre = readdir($directorio)) !== false && microtime(true) < $tope) {
            $ruta = $almacen . '/' . $carpeta . '/' . $nombre;
            if ($nombre[0] !== '.' && is_file($ruta) && ($ahora - (int) @filemtime($ruta)) > $vida) {
                @unlink($ruta);
            }
        }
        closedir($directorio);
    }
    recortarEventos($almacen . '/eventos.csv');
    purgarLeadsAntiguos($almacen);
}

/** POST de JSON con tiempo de espera corto. Devuelve el cuerpo o null si falló. */
function postJson(string $url, array $datos, int $segundos = 3): ?string
{
    $contexto = stream_context_create(['http' => [
        'method'        => 'POST',
        'header'        => "Content-Type: application/json\r\n",
        'content'       => (string) json_encode($datos, JSON_UNESCAPED_UNICODE),
        'timeout'       => $segundos,
        'ignore_errors' => true,
    ]]);
    $respuesta = @file_get_contents($url, false, $contexto);
    return $respuesta === false ? null : $respuesta;
}

/**
 * Aviso a un webhook (n8n para avisar al asesor, Apps Script para Google
 * Sheets…). Solo URLs https. Si falla, queda en el log y sigue: el lead ya
 * está guardado.
 */
function avisarWebhook(string $url, array $datos): void
{
    if (!str_starts_with($url, 'https://')) {
        error_log('CAPSUR: webhook ignorado, la URL debe empezar con https://');
        return;
    }
    if (postJson($url, $datos) === null) {
        error_log('CAPSUR: no respondió el webhook ' . (parse_url($url, PHP_URL_HOST) ?: ''));
    }
}

/**
 * Comprueba el token de Cloudflare Turnstile. Si Cloudflare no responde, deja
 * pasar (y lo anota): perder leads reales por una caída ajena sería peor que
 * dejar entrar algún bot, que igual frenan el límite por IP y la trampa.
 */
function turnstileValido(string $token, string $ip): bool
{
    if ($token === '' || strlen($token) > 2048) {
        return false;
    }
    $respuesta = postJson('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
        'secret'   => env('TURNSTILE_SECRET'),
        'response' => $token,
        'remoteip' => $ip,
    ], 5);
    if ($respuesta === null) {
        error_log('CAPSUR: Turnstile no respondió; se deja pasar el envío');
        return true;
    }
    return (json_decode($respuesta, true)['success'] ?? false) === true;
}

/**
 * Plazo de conservación (política de privacidad, punto 6): una vez al día
 * quita de leads.csv las filas con más de RETENCION_MESES meses (24 si no se
 * indica). Reescribe bajo el mismo bloqueo que usa api/enviar.php para añadir.
 */
function purgarLeadsAntiguos(string $almacen): void
{
    $marca = $almacen . '/rate/.purga-leads';
    $ruta  = $almacen . '/leads.csv';
    if (!is_file($ruta) || (is_file($marca) && time() - (int) filemtime($marca) < 86400)) {
        return;
    }
    @touch($marca);
    $meses  = max(1, (int) env('RETENCION_MESES', '24'));
    $limite = (new DateTimeImmutable("-{$meses} months", new DateTimeZone('America/Lima')))->format('Y-m-d H:i:s');

    $f = @fopen($ruta, 'c+');
    if (!$f) {
        return;
    }
    flock($f, LOCK_EX);
    $cabecera = fgetcsv($f);
    $quedan = [];
    $quitadas = 0;
    while (is_array($cabecera) && ($fila = fgetcsv($f)) !== false) {
        // La fecha es la primera columna en todas las versiones del archivo.
        if (($fila[0] ?? '') !== '' && $fila[0] < $limite) {
            $quitadas++;
            continue;
        }
        $quedan[] = $fila;
    }
    if ($quitadas > 0) {
        rewind($f);
        ftruncate($f, 0);
        fputcsv($f, $cabecera);
        foreach ($quedan as $fila) {
            fputcsv($f, $fila);
        }
        fflush($f);
        error_log("CAPSUR: plazo de conservación, {$quitadas} leads de más de {$meses} meses eliminados");
    }
    flock($f, LOCK_UN);
    fclose($f);
}

/**
 * ¿La carpeta ya tiene $maximo archivos o más? Tope global contra una red
 * de bots que, repartida en muchas IPs, esquive el límite por IP y llene el
 * disco. Deja de contar al llegar al tope.
 */
function carpetaLlena(string $carpeta, int $maximo): bool
{
    if (!is_dir($carpeta)) {
        return false;
    }
    $n = 0;
    foreach (new FilesystemIterator($carpeta, FilesystemIterator::SKIP_DOTS) as $_) {
        if (++$n >= $maximo) {
            return true;
        }
    }
    return false;
}

/**
 * Si eventos.csv (los clics del mapa de calor) pasa de 20 MB, conserva la
 * cabecera y los últimos 10 MB, que son los clics más recientes. El panel lo
 * recorre entero en cada carga: sin tope, cada vez tardaría más y el disco
 * acabaría lleno.
 */
function recortarEventos(string $ruta, int $maximo = 20_000_000, int $conservar = 10_000_000): void
{
    if (!is_file($ruta) || filesize($ruta) <= $maximo || !($manejador = @fopen($ruta, 'r+'))) {
        return;
    }
    flock($manejador, LOCK_EX); // el mismo bloqueo que toma quien añade filas
    $tamano = (int) (fstat($manejador)['size'] ?? 0);
    if ($tamano > $maximo) {
        $cabecera = (string) fgets($manejador);
        fseek($manejador, $tamano - $conservar);
        fgets($manejador); // la fila que quedó cortada por la mitad
        $cola = (string) stream_get_contents($manejador);
        rewind($manejador);
        ftruncate($manejador, 0);
        fwrite($manejador, $cabecera . $cola);
        fflush($manejador);
    }
    flock($manejador, LOCK_UN);
    fclose($manejador);
}
