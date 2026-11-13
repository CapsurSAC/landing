<?php
/**
 * Posibles: lo que alguien escribió en el formulario sin llegar a enviarlo.
 *
 *  POST  recibe el borrador del navegador (src/lib/borrador.js) y lo guarda en
 *        storage/posibles/<id>.json, un archivo por persona que se reescribe en
 *        cada cambio. El panel los lista en admin/posibles.php.
 *
 * Solo se guarda si la persona marcó la casilla de autorización (Ley 29733) y
 * dejó algún dato de contacto. Si la desmarca, o borra todo, el archivo se
 * borra. Cuando envía el formulario, api/enviar.php lo borra y deja una marca
 * <id>.enviado para que un borrador que llegue tarde no lo vuelva a crear.
 * Los posibles sin cambios en 90 días se borran solos (limpiezaOcasional).
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap-min.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap-min.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(405, ['ok' => false, 'error' => 'Método no permitido']);
}

exigirOrigenPropio();
exigirJson();

// Un borrador viaja unos segundos después de cada cambio: 300 en 15 minutos
// cubren a varias personas tras la misma IP llenando el formulario sin prisa.
$ipLimite = ipParaLimite(ipVisitante());
if (!registrarSiCabe('posibles:' . $ipLimite, 900, 300)) {
    responder(429, ['ok' => false]);
}

$crudo = file_get_contents('php://input', false, null, 0, 5001) ?: '';
if (strlen($crudo) > 5000) {
    responder(413, ['ok' => false]);
}
$entrada = json_decode($crudo, true);
if (!is_array($entrada)) {
    responder(400, ['ok' => false]);
}

$id = strtolower(limpiar($entrada['id'] ?? '', 36));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id)) {
    responder(422, ['ok' => false, 'error' => 'id']);
}

$carpeta = $carpetaConfig . '/../storage/posibles';
if (!is_dir($carpeta)) {
    @mkdir($carpeta, 0755, true);
}
$ruta = $carpeta . '/' . $id . '.json';

// Ya envió el formulario: es un lead, no un posible.
if (is_file($carpeta . '/' . $id . '.enviado')) {
    responder(200, ['ok' => true]);
}

$nombre   = limpiar($entrada['nombre'] ?? '', 80);
$correo   = limpiar($entrada['email'] ?? '', 120);
$whatsapp = limpiar($entrada['whatsapp'] ?? '', 20);
$consiente = filter_var($entrada['consentimiento'] ?? false, FILTER_VALIDATE_BOOLEAN);

// Sin autorización o sin nada con qué contactarle: no se guarda, y si ya
// había algo se borra (retiró la autorización o vació los campos).
if (!$consiente || ($nombre === '' && $correo === '' && $whatsapp === '')) {
    if (is_file($ruta)) {
        @unlink($ruta);
    }
    responder(200, ['ok' => true]);
}

// Cada id nuevo es un archivo: sin tope, un script podría llenar el disco.
if (!is_file($ruta) && !registrarSiCabe('posibles-nuevos:' . $ipLimite, 900, 20)) {
    responder(429, ['ok' => false]);
}

$ahora  = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d H:i:s');
$pagina = limpiar($entrada['pagina'] ?? '', 300);

$manejador = @fopen($ruta, 'c+');
if (!$manejador) {
    error_log('CAPSUR: no se pudo escribir en ' . $ruta);
    responder(500, ['ok' => false]);
}
flock($manejador, LOCK_EX);
$previo = json_decode((string) stream_get_contents($manejador), true);

$registro = [
    'id'          => $id,
    'creado'      => is_array($previo) && !empty($previo['creado']) ? (string) $previo['creado'] : $ahora,
    'actualizado' => $ahora,
    'nombre'      => $nombre,
    'email'       => $correo,
    'whatsapp'    => $whatsapp,
    // Como lo escribió: puede estar a medio terminar. El panel solo enlaza los válidos.
    'email_valido'    => correoValido($correo),
    'whatsapp_valido' => celularValido($whatsapp) && !celularInventado($whatsapp),
    'area'        => limpiar($entrada['area'] ?? '', 60),
    'objetivo'    => limpiar($entrada['objetivo'] ?? '', 60),
    'inicio'      => limpiar($entrada['inicio'] ?? '', 60),
    'marketing'   => filter_var($entrada['marketing'] ?? false, FILTER_VALIDATE_BOOLEAN),
    'version_consentimiento' => limpiar($entrada['version_consentimiento'] ?? '', 30),
    'pagina'      => $pagina,
    'ip'          => ipVisitante(),
] + utmDe($entrada, $pagina);

$json = json_encode($registro, JSON_UNESCAPED_UNICODE);
if ($json !== false) {
    rewind($manejador);
    ftruncate($manejador, 0);
    fwrite($manejador, $json);
    fflush($manejador);
}
flock($manejador, LOCK_UN);
fclose($manejador);

limpiezaOcasional();

responder(200, ['ok' => true]);
