<?php
/**
 * Arranque del endpoint del formulario: utilidades comunes + PHPMailer.
 * Este archivo vive FUERA de public_html, así que nadie puede abrirlo por URL.
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap-min.php';

// El formulario sí necesita el .env; el resto de endpoints no.
if (!defined('CAPSUR_ENV_CARGADO')) {
    http_response_code(500);
    error_log('CAPSUR: falta el archivo .env de configuración');
    header('Content-Type: application/json; charset=utf-8');
    exit(json_encode(['ok' => false, 'error' => 'Configuración incompleta']));
}

// ── PHPMailer ──────────────────────────────────────────────────────────────
// Soporta las dos formas de instalación habituales en cPanel.
$autoload = __DIR__ . '/vendor/autoload.php';

if (is_readable($autoload)) {
    // Instalado con Composer:  composer require phpmailer/phpmailer
    require $autoload;
} else {
    // Instalado a mano: los tres archivos descomprimidos en config/PHPMailer/
    $manual = __DIR__ . '/PHPMailer/';
    foreach (['Exception.php', 'PHPMailer.php', 'SMTP.php'] as $archivo) {
        if (!is_readable($manual . $archivo)) {
            http_response_code(500);
            error_log('CAPSUR: no se encontró PHPMailer en ' . $manual);
            header('Content-Type: application/json; charset=utf-8');
            exit(json_encode(['ok' => false, 'error' => 'Configuración incompleta']));
        }
        require $manual . $archivo;
    }
}
