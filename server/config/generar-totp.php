<?php
/**
 * Activa el segundo factor del panel: genera la clave para una app de
 * autenticación (Google Authenticator, Microsoft Authenticator, Authy…).
 *
 *   php config/generar-totp.php
 *
 * 1. En la app: "Agregar cuenta" → "Introducir clave" y pega la clave.
 * 2. Copia la línea ADMIN_TOTP=… en config/.env (o en las variables de EasyPanel).
 * 3. Desde entonces, entrar al panel pide también el código de 6 dígitos.
 *
 * Para desactivarlo, deja ADMIN_TOTP vacío. Si pierdes el teléfono, genera
 * una clave nueva: la anterior deja de valer.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/panel.php';

$alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
$secreto  = '';
for ($i = 0; $i < 32; $i++) {
    $secreto .= $alfabeto[random_int(0, 31)];
}

$cuenta = rawurlencode('Panel CAPSUR:' . (env('ADMIN_USUARIO') ?: 'admin'));
echo "Clave para la app (escríbela tal cual):\n  " . implode(' ', str_split($secreto, 4)) . "\n\n";
echo "O este enlace, si tu app lo acepta:\n  otpauth://totp/{$cuenta}?secret={$secreto}&issuer=CAPSUR\n\n";
echo "Código de ahora, para comprobar que la app quedó bien: " . codigoTotp($secreto, intdiv(time(), 30)) . "\n\n";
echo "Línea para la configuración:\nADMIN_TOTP={$secreto}\n";
