<?php
/**
 * Reintenta los leads que no pudieron registrarse en Chatwoot.
 * Solo por línea de comandos, pensado para el cron de cPanel:
 *
 *   *\/15 * * * * php /home/usuario/config/reintentar-chatwoot.php
 *   (sin la barra invertida: está ahí para no cerrar este comentario)
 *
 * En Docker no hay cron: n8n llama a api/reintentar.php, que hace lo mismo.
 * No imprime nada si la cola está vacía, para que el cron no mande correos.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/bootstrap-min.php';
require __DIR__ . '/chatwoot.php';

if (!cw_activo()) {
    fwrite(STDERR, "CHATWOOT_TOKEN está vacío: no hay nada que reintentar.\n");
    exit(1);
}

$resumen = cw_reintentar_pendientes(240);

if (array_sum($resumen) > 0) {
    echo sprintf(
        "Chatwoot: %d registrados, %d siguen en cola, %d fallidos, %d sin procesar.\n",
        $resumen['hecho'],
        $resumen['pendiente'],
        $resumen['fallido'],
        $resumen['ocupado'] + $resumen['sin_tiempo']
    );
}
