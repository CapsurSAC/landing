<?php
/**
 * Genera el hash de la contraseña del panel de leads.
 *
 *   php config/generar-hash.php "una frase larga y propia"
 *
 * Copia la línea que imprime en config/.env. La contraseña nunca se guarda
 * en claro: solo su hash, que no permite recuperarla.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$clave = $argv[1] ?? '';

if ($clave === '') {
    fwrite(STDERR, "Uso: php generar-hash.php \"contraseña\"\n");
    exit(1);
}
if (mb_strlen($clave) < 12) {
    fwrite(STDERR, "Usa al menos 12 caracteres. Una frase de cuatro palabras protege más que ocho símbolos.\n");
    exit(1);
}

$algoritmo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
echo 'ADMIN_HASH=' . password_hash($clave, $algoritmo), PHP_EOL;
