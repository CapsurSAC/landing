<?php
/**
 * Estado del servicio, para el HEALTHCHECK de Docker y un monitor externo
 * (UptimeRobot, Better Stack…): 200 si todo bien, 503 si no.
 *
 * Comprueba lo que hace perder leads sin que nadie lo note: que storage/ se
 * pueda escribir (sin el volumen o con permisos malos, los leads no quedan) y
 * que las reglas del formulario se puedan leer. No dice nada más: ni
 * versiones, ni rutas, ni configuración.
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap-min.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap-min.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$almacen = $carpetaConfig . '/../storage';
$prueba  = $almacen . '/.salud';
$escribe = @file_put_contents($prueba, (string) time()) !== false;

try {
    reglas();
    $reglas = true;
} catch (Throwable) {
    $reglas = false;
}

$ok = $escribe && $reglas;
responder($ok ? 200 : 503, ['ok' => $ok]);
