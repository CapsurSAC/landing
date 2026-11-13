<?php
/**
 * Copia de seguridad cifrada de todo storage/ (leads, posibles, visitas,
 * estados, auditoría y cola de Chatwoot).
 *
 *   php /var/www/config/respaldo.php                 (en el contenedor)
 *   php config/respaldo.php                          (en cPanel, por cron)
 *
 * Deja storage/respaldos/capsur-AAAAMMDD-HHMM.tar.gz.enc y conserva los
 * últimos RESPALDO_CONSERVAR (14 por defecto). Se cifra con RESPALDO_CLAVE
 * (32 caracteres o más): sin la clave no se puede abrir, así que guárdala
 * fuera del servidor. Para que sirva de algo, cópialo FUERA del servidor
 * (DESPLIEGUE.md, "Copias de seguridad").
 *
 * Para abrir un respaldo:
 *   php config/respaldo.php --abrir archivo.tar.gz.enc destino.tar.gz
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/bootstrap-min.php';

$clave = env('RESPALDO_CLAVE');
if (strlen($clave) < 32) {
    fwrite(STDERR, "Falta RESPALDO_CLAVE (32 caracteres o más) en la configuración.\n");
    exit(1);
}
// Clave de 32 bytes derivada de la frase: la frase puede tener cualquier largo.
$llave = sodium_crypto_generichash($clave, '', SODIUM_CRYPTO_SECRETBOX_KEYBYTES);

if (($argv[1] ?? '') === '--abrir') {
    [$origen, $destino] = [$argv[2] ?? '', $argv[3] ?? ''];
    $datos = (string) @file_get_contents($origen);
    $nonce = substr($datos, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    $plano = sodium_crypto_secretbox_open(substr($datos, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, $llave);
    if ($plano === false || $destino === '') {
        fwrite(STDERR, "No se pudo abrir: archivo dañado o clave distinta.\n");
        exit(1);
    }
    file_put_contents($destino, $plano);
    echo "Listo: {$destino}\n";
    exit(0);
}

$almacen  = realpath(__DIR__ . '/../storage') ?: __DIR__ . '/../storage';
$carpeta  = $almacen . '/respaldos';
@mkdir($carpeta, 0750, true);
$nombre   = 'capsur-' . date('Ymd-Hi');
$tar      = sys_get_temp_dir() . "/{$nombre}.tar";

$archivo = new PharData($tar);
$archivo->buildFromIterator(new CallbackFilterIterator(
    new RecursiveIteratorIterator(new RecursiveDirectoryIterator($almacen, FilesystemIterator::SKIP_DOTS)),
    // Ni los respaldos anteriores ni los contadores de límite, que no hacen falta.
    static fn (SplFileInfo $f) => !preg_match('#/(respaldos|rate)/#', str_replace('\\', '/', $f->getPathname())),
), $almacen);
$archivo->compress(Phar::GZ);
unset($archivo);
@unlink($tar);

$plano = (string) file_get_contents("{$tar}.gz");
@unlink("{$tar}.gz");
$nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
$final = "{$carpeta}/{$nombre}.tar.gz.enc";
file_put_contents($final, $nonce . sodium_crypto_secretbox($plano, $nonce, $llave));
sodium_memzero($plano);

$conservar = max(1, (int) env('RESPALDO_CONSERVAR', '14'));
$todos = glob("{$carpeta}/capsur-*.tar.gz.enc") ?: [];
sort($todos);
foreach (array_slice($todos, 0, max(0, count($todos) - $conservar)) as $viejo) {
    @unlink($viejo);
}

echo "Respaldo cifrado: {$final} (" . round(filesize($final) / 1024) . " KB)\n";
