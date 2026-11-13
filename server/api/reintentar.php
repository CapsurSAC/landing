<?php
/**
 * Reintenta los leads que no pudieron registrarse en Chatwoot.
 *
 * Es para Docker, donde no hay cron: n8n lo llama por POST cada 15 minutos con
 * la cabecera  X-Reintento-Token: <REINTENTO_TOKEN>.  A quien no trae el token
 * correcto se le responde 404, como si el archivo no existiera.
 *
 * Con cron (cPanel) no hace falta subirlo: usa config/reintentar-chatwoot.php.
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap-min.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap-min.php';
require $carpetaConfig . '/chatwoot.php';

$clave    = env('REINTENTO_TOKEN');
$recibida = (string) ($_SERVER['HTTP_X_REINTENTO_TOKEN'] ?? '');
// Opcional: solo desde la IP de n8n (IPs o rangos CIDR separados por coma).
$ips      = array_filter(array_map('trim', explode(',', env('REINTENTO_IPS'))));
$ipOk     = !$ips || ipEnRangos(ipVisitante(), $ips);

// Una clave corta se trata como si no hubiera: sin clave, este archivo no existe.
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !$ipOk || strlen($clave) < 16 || !hash_equals($clave, $recibida)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Not Found');
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (!cw_activo()) {
    responder(200, ['ok' => true, 'activo' => false]);
}

responder(200, ['ok' => true, 'activo' => true] + cw_reintentar_pendientes());
