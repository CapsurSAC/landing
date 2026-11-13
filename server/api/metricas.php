<?php
/**
 * Medición de uso de la landing.
 *
 *  POST  recibe lotes de eventos del navegador (src/lib/medicion.js) y guarda:
 *          storage/eventos.csv         una fila por clic (mapa de calor)
 *          storage/visitas/<id>.json   el estado de cada visita: origen (UTM,
 *                                      referente), dispositivo, sistema y
 *                                      navegador, tiempo activo y por sección,
 *                                      scroll, campos llenados, respuestas
 *                                      elegidas, errores, envío.
 *        Nombre y correo SOLO se guardan si la visita marcó la casilla de
 *        autorización (Ley 29733); si la desmarca, se borran.
 *
 *  GET   ?dispositivo=escritorio|tablet|movil
 *        devuelve los puntos de clic de los últimos 30 días para dibujar el
 *        mapa de calor sobre la landing. Exige sesión del panel.
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap-min.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap-min.php';

$almacen = $carpetaConfig . '/../storage';
$visitas = $almacen . '/visitas';
$eventos = $almacen . '/eventos.csv';
$DISPOSITIVOS = ['movil', 'tablet', 'escritorio'];
$SECCIONES    = ['inicio', 'instituciones', 'porque', 'programas', 'formulario'];
$CON_OPCIONES = ['area', 'objetivo', 'inicio']; // los tres selects

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$metodo = $_SERVER['REQUEST_METHOD'] ?? '';

// ── GET: puntos del mapa de calor (solo panel) ─────────────────────────────
if ($metodo === 'GET') {
    sesionPanel();
    if (empty($_SESSION['admin'])) {
        responder(401, ['ok' => false, 'error' => 'Sin sesión del panel']);
    }
    $disp  = in_array($_GET['dispositivo'] ?? '', $DISPOSITIVOS, true) ? $_GET['dispositivo'] : 'escritorio';
    $desde = (new DateTimeImmutable('-30 days', new DateTimeZone('America/Lima')))->format('Y-m-d');
    $puntos = [];
    if ($f = @fopen($eventos, 'r')) {
        fgetcsv($f);
        while (($r = fgetcsv($f)) !== false) {
            if (count($r) < 8 || $r[0] === 'fecha' || $r[2] !== $disp || $r[0] < $desde) {
                continue;
            }
            $puntos[] = [(float) $r[5], (int) $r[6]];
            if (count($puntos) >= 5000) {
                break; // shortcut: 5000 puntos bastan para el dibujo; muestrear si algún día se queda corto
            }
        }
        fclose($f);
    }
    responder(200, ['ok' => true, 'dispositivo' => $disp, 'puntos' => $puntos]);
}

if ($metodo !== 'POST') {
    header('Allow: GET, POST');
    responder(405, ['ok' => false, 'error' => 'Método no permitido']);
}

// ── POST: eventos del navegador ────────────────────────────────────────────
exigirOrigenPropio();
exigirJson();

$ipLimite = ipParaLimite(ipVisitante());
if (!registrarSiCabe('metricas:' . $ipLimite, 900, 600)) {
    responder(429, ['ok' => false]);
}

$crudo = file_get_contents('php://input', false, null, 0, 20001) ?: ''; // ni un byte más de los que se aceptan
if (strlen($crudo) > 20000) {
    responder(413, ['ok' => false]);
}
$lote = json_decode($crudo, true);
if (!is_array($lote)) {
    responder(400, ['ok' => false]);
}

$visita = (string) ($lote['visita'] ?? '');
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f-]{27}$/', $visita)) {
    responder(422, ['ok' => false, 'error' => 'visita']);
}
// Id del borrador (src/lib/borrador.js): une las visitas de quien vuelve otro día.
$borrador = strtolower(limpiar($lote['borrador'] ?? '', 36));
$borrador = preg_match('/^[0-9a-f-]{36}$/', $borrador) ? $borrador : '';
$disp   = in_array($lote['dispositivo'] ?? '', $DISPOSITIVOS, true) ? $lote['dispositivo'] : 'escritorio';
$pagina = limpiar($lote['pagina'] ?? '', 300);
$lista  = is_array($lote['eventos'] ?? null) ? array_slice($lote['eventos'], 0, 50) : [];

$ahora = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d H:i:s');

/** Sistema operativo y navegador a grandes rasgos; detecta el navegador interno de Facebook e Instagram. */
function agenteCorto(string $ua): array
{
    $so = preg_match('/iPhone|iPad|iPod/', $ua) ? 'iOS'
        : (str_contains($ua, 'Android') ? 'Android'
        : (str_contains($ua, 'Windows') ? 'Windows'
        : (str_contains($ua, 'Mac OS') ? 'Mac'
        : (str_contains($ua, 'Linux') ? 'Linux' : 'Otro'))));
    $nav = preg_match('/FBAN|FBAV|Instagram/', $ua) ? 'App de Facebook/Instagram'
        : (str_contains($ua, 'Edg/') ? 'Edge'
        : (str_contains($ua, 'OPR/') ? 'Opera'
        : (str_contains($ua, 'Chrome/') ? 'Chrome'
        : (str_contains($ua, 'Firefox/') ? 'Firefox'
        : (str_contains($ua, 'Safari/') ? 'Safari' : 'Otro')))));
    return [$so, $nav];
}

/** Origen de la visita a partir de la URL (UTM, fbclid) y el referente. */
function origenDe(string $pagina, string $referente): array
{
    $q = [];
    parse_str((string) parse_url($pagina, PHP_URL_QUERY), $q);
    $fuente = limpiar($q['utm_source'] ?? '', 40);
    if ($fuente === '' && isset($q['fbclid'])) {
        $fuente = 'facebook';
    }
    if ($fuente === '' && $referente !== '') {
        $fuente = preg_replace('/^(www|m|l|lm)\./', '', $referente) ?? $referente;
    }
    return [
        'fuente'   => $fuente !== '' ? mb_strtolower($fuente) : 'directo',
        'medio'    => mb_strtolower(limpiar($q['utm_medium'] ?? '', 40)),
        'campana'  => limpiar($q['utm_campaign'] ?? '', 60),
        'anuncio'  => limpiar($q['utm_content'] ?? '', 60),
    ];
}

// Estado actual de la visita (si ya existía)
if (!is_dir($visitas)) {
    @mkdir($visitas, 0755, true);
}
$rutaVisita = $visitas . '/' . $visita . '.json';

// Cada identificador nuevo crea un archivo: sin tope, un script que se inventa
// uno por petición llenaría el disco.
if (!is_file($rutaVisita) && !registrarSiCabe('visitas-nuevas:' . $ipLimite, 900, 120)) {
    responder(429, ['ok' => false]);
}
// Tope global: la medición es prescindible, así que llegado el tope se calla
// (responde bien, sin guardar) en vez de llenar el disco.
if (!is_file($rutaVisita) && carpetaLlena($visitas, max(1000, (int) env('VISITAS_MAX', '100000')))) {
    responder(200, ['ok' => true]);
}

// Leer, modificar y escribir bajo el mismo bloqueo: dos lotes de la misma
// visita que llegan a la vez (dos pestañas, o el lote de salida junto a otro)
// ya no se pisan.
$manejadorVisita = @fopen($rutaVisita, 'c+');
$leido = null;
if ($manejadorVisita) {
    flock($manejadorVisita, LOCK_EX);
    $leido = json_decode((string) stream_get_contents($manejadorVisita), true);
}
$estado = is_array($leido) ? $leido : [];
$estado += [
    'inicio' => $ahora, 'dispositivo' => $disp, 'pagina' => $pagina,
    'campos' => [], 'respuestas' => [], 'errores' => [], 'secciones' => [],
    'scroll' => 0, 'tiempo' => 0, 'consintio' => false, 'envio' => false, 'clics' => 0,
];
foreach (['campos', 'respuestas', 'errores', 'secciones'] as $clave) {
    if (!is_array($estado[$clave])) {
        $estado[$clave] = []; // archivo dañado: se rehace esa parte en vez de fallar
    }
}
$estado['ultima'] = $ahora;
if ($borrador !== '') {
    $estado['borrador'] = $borrador;
}
if (empty($estado['so'])) {
    [$estado['so'], $estado['navegador']] = agenteCorto((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
}

$clics = [];
foreach ($lista as $ev) {
    if (!is_array($ev)) {
        continue;
    }
    $tipo = texto($ev['tipo'] ?? '');

    if ($tipo === 'visita') {
        $referente = mb_strtolower(limpiar($ev['referente'] ?? '', 100));
        $estado += origenDe($pagina, $referente);
        $estado['referente']  = $referente;
        $estado['ancho']      = max(0, min(10000, (int) ($ev['ancho'] ?? 0)));
        $estado['alto']       = max(0, min(10000, (int) ($ev['alto'] ?? 0)));
        $estado['idioma']     = limpiar($ev['idioma'] ?? '', 10);
        $estado['recurrente'] = !empty($ev['recurrente']);
        // Prueba A/B del titular (src/data/contenido.js)
        $variante = preg_replace('/[^a-z0-9_-]/i', '', limpiar($ev['variante'] ?? '', 20));
        if ($variante !== '') $estado['variante'] = $variante;
        continue;
    }

    if ($tipo === 'clic') {
        $x = (float) ($ev['x'] ?? -1);
        $y = (int) ($ev['y'] ?? -1);
        // Nadie hace 300 clics en una landing: lo que pase de ahí no es una persona.
        if ($x < 0 || $x > 100 || $y < 0 || $y > 100000 || (int) $estado['clics'] >= 300) {
            continue;
        }
        $estado['clics'] = (int) $estado['clics'] + 1;
        $clics[] =[$ahora, $visita, $disp, limpiar($ev['seccion'] ?? '', 40), limpiar($ev['elemento'] ?? '', 80), round($x, 1), $y, $pagina];
        continue;
    }

    if ($tipo === 'salida') {
        $estado['scroll'] = max((int) $estado['scroll'], max(0, min(100, (int) ($ev['scroll'] ?? 0))));
        $estado['tiempo'] = max((int) $estado['tiempo'], max(0, min(7200, (int) ($ev['tiempo'] ?? 0))));
        // Core Web Vitals (src/lib/vitales.js): la última medida de la visita.
        foreach (['lcp' => 60000, 'inp' => 60000] as $clave => $tope) {
            if (($ev[$clave] ?? 0) > 0) $estado[$clave] = min($tope, (int) $ev[$clave]);
        }
        if (isset($ev['cls']) && is_numeric($ev['cls'])) $estado['cls'] = max(0, min(10, round((float) $ev['cls'], 3)));
        foreach ((array) ($ev['secciones'] ?? []) as $id => $seg) {
            if (in_array($id, $SECCIONES, true)) {
                $estado['secciones'][$id] = max((int) ($estado['secciones'][$id] ?? 0), max(0, min(7200, (int) $seg)));
            }
        }
        continue;
    }

    if ($tipo === 'campo' || $tipo === 'error') {
        $campo = preg_replace('/[^a-z_]/', '', texto($ev['elemento'] ?? ''));
        if ($campo === '' || strlen($campo) > 20) {
            continue;
        }
        // El formulario tiene media docena de campos: más nombres que estos son inventados.
        $conocido = isset($estado['campos'][$campo]) || isset($estado['errores'][$campo]);
        if (!$conocido && count($estado['campos']) + count($estado['errores']) >= 20) {
            continue;
        }
        if ($tipo === 'error') {
            $estado['errores'][$campo] = min(999, (int) ($estado['errores'][$campo] ?? 0) + 1);
            continue;
        }
        $lleno = !empty($ev['lleno']);
        $estado['campos'][$campo] = $lleno;
        $estado['ultimo_campo'] = $campo;
        if (in_array($campo, $CON_OPCIONES, true)) {
            $texto = limpiar($ev['texto'] ?? '', 60);
            if ($lleno && $texto !== '') $estado['respuestas'][$campo] = $texto;
            else unset($estado['respuestas'][$campo]);
        }
        if ($campo === 'consentimiento') {
            $estado['consintio'] = $lleno;
            if (!$lleno) {
                unset($estado['nombre'], $estado['correo'], $estado['whatsapp']); // retiró la autorización
            }
        }
    }

    if ($tipo === 'envio') {
        $estado['envio']    = true;
        $estado['envio_en'] = $ahora;
    }

    // Datos de contacto: solo con la casilla marcada, nunca antes.
    if ($estado['consintio']) {
        $nombre = limpiar($ev['nombre'] ?? '', 80);
        $correo = filter_var(trim(texto($ev['correo'] ?? '')), FILTER_VALIDATE_EMAIL);
        if ($nombre !== '') $estado['nombre'] = $nombre;
        if ($correo)        $estado['correo'] = $correo;
        $celular = limpiar($ev['whatsapp'] ?? '', 20);
        if ($celular !== '' && celularValido($celular)) $estado['whatsapp'] = $celular;
    }
}

if ($manejadorVisita) {
    $json = json_encode($estado, JSON_UNESCAPED_UNICODE);
    if ($json !== false) { // si no se puede codificar, se conserva lo que había
        rewind($manejadorVisita);
        ftruncate($manejadorVisita, 0);
        fwrite($manejadorVisita, $json);
        fflush($manejadorVisita);
    }
    flock($manejadorVisita, LOCK_UN);
    fclose($manejadorVisita);
}

if ($clics) {
    // filesize y no ftell: en modo "a" ftell devuelve 0 en Windows aunque el archivo tenga contenido.
    $nuevo = !is_file($eventos) || filesize($eventos) === 0;
    if ($f = @fopen($eventos, 'a')) {
        flock($f, LOCK_EX);
        if ($nuevo) {
            fputcsv($f, ['fecha', 'visita', 'dispositivo', 'seccion', 'elemento', 'x', 'y', 'pagina']);
        }
        foreach ($clics as $fila) {
            fputcsv($f, array_map('celdaCsv', $fila));
        }
        flock($f, LOCK_UN);
        fclose($f);
    }
}

// Visitas de más de 90 días, cuentas de límite vencidas y el exceso de eventos.csv.
limpiezaOcasional();

responder(200, ['ok' => true]);
