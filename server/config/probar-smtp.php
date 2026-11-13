<?php
/**
 * Comprueba la configuración SMTP enviando un correo de prueba.
 *
 * Úsalo ANTES de tocar el formulario: si algo falla, aquí verás el motivo
 * exacto en lugar de un genérico "no se pudo enviar".
 *
 * USO (Terminal de cPanel, o "docker exec" en Docker):
 *     php config/probar-smtp.php
 *     php config/probar-smtp.php otro-destino@gmail.com
 *
 * SIN TERMINAL (cPanel → Trabajos cron):
 *     Crea un cron con el comando  php /home/USUARIO/config/probar-smtp.php
 *     y tu correo en "Correo electrónico de cron": el resultado te llega ahí.
 *     Bórralo en cuanto lo recibas.
 *
 * Solo funciona por línea de comandos. Abierto por web, cualquiera vería parte
 * de la configuración y podría mandar correos a quien quisiera desde tu
 * cuenta: NO lo subas a public_html.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/bootstrap.php';

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

// MAIL_TO admite varios correos separados por coma: la prueba va al primero.
$destino = trim((string) ($argv[1] ?? explode(',', env('MAIL_TO'))[0]));

$linea = str_repeat('─', 58);

echo "{$linea}\n  PRUEBA DE ENVÍO SMTP — CAPSUR\n{$linea}\n\n";

// ── 1. Lo que dice el .env ─────────────────────────────────────────────────
$claveOculta = env('SMTP_PASS') !== ''
    ? substr(env('SMTP_PASS'), 0, 4) . str_repeat('•', 12)
    : '(vacía)';

printf("  Servidor     : %s\n", env('SMTP_HOST') ?: '(vacío)');
printf("  Puerto       : %s\n", env('SMTP_PORT', '587'));
printf("  Usuario      : %s\n", env('SMTP_USER') ?: '(vacío)');
printf("  Contraseña   : %s\n", $claveOculta);
printf("  Remitente    : %s\n", env('MAIL_FROM') ?: '(vacío)');
printf("  Destinatario : %s\n\n", $destino ?: '(vacío)');

// ── 2. Comprobaciones previas ──────────────────────────────────────────────
$fallos = [];
foreach (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as $obligatorio) {
    if (env($obligatorio) === '') {
        $fallos[] = "Falta {$obligatorio} en config/.env";
    }
}
if (!filter_var($destino, FILTER_VALIDATE_EMAIL)) {
    $fallos[] = 'El destinatario no es un correo válido';
}
if (!filter_var(env('MAIL_FROM'), FILTER_VALIDATE_EMAIL)) {
    $fallos[] = 'MAIL_FROM no es un correo válido';
}

if ($fallos) {
    echo "  ✗ No se puede continuar:\n";
    foreach ($fallos as $f) {
        echo "      · {$f}\n";
    }
    exit(1);
}

// Aviso si el remitente no es del propio dominio
$dominioRemitente = substr(strrchr(env('MAIL_FROM'), '@') ?: '', 1);
if (in_array($dominioRemitente, ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'], true)) {
    echo "  ⚠  MAIL_FROM usa un dominio ajeno ({$dominioRemitente}).\n";
    echo "     El remitente debe ser de TU dominio o el relay lo rechazará\n";
    echo "     y, si pasa, acabará en spam. El correo de la persona que\n";
    echo "     rellena el formulario viaja en Reply-To, no aquí.\n\n";
}

// ── 3. Envío ───────────────────────────────────────────────────────────────
echo "  Conectando…\n\n";

$mail = new PHPMailer(true);
$registro = '';

try {
    $mail->isSMTP();
    $mail->Host       = env('SMTP_HOST');
    $mail->SMTPAuth   = true;
    $mail->Username   = env('SMTP_USER');
    $mail->Password   = env('SMTP_PASS');
    $mail->Port       = (int) env('SMTP_PORT', '587');
    $mail->SMTPSecure = $mail->Port === 465
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->CharSet    = 'UTF-8';
    $mail->Timeout    = 20;

    // Diálogo completo con el servidor: es lo que revela la causa real
    $mail->SMTPDebug  = 2;
    $mail->Debugoutput = function ($cadena) use (&$registro) {
        $registro .= '      ' . trim($cadena) . "\n";
    };

    $mail->setFrom(env('MAIL_FROM'), env('MAIL_FROM_NOMBRE', 'Prueba CAPSUR'));
    $mail->addAddress($destino);

    $mail->isHTML(true);
    $mail->Subject = 'Prueba de configuración SMTP — ' . date('H:i:s');
    $mail->Body    = '<div style="font-family:Arial,sans-serif;max-width:520px">
        <h2 style="color:#0A2A63">La configuración SMTP funciona</h2>
        <p>Si estás leyendo esto, el formulario de la landing podrá enviarte
        los avisos sin problema.</p>
        <p style="color:#718096;font-size:13px">
          Servidor: ' . htmlspecialchars(env('SMTP_HOST')) . '<br>
          Enviado: ' . date('d/m/Y H:i:s') . '
        </p></div>';
    $mail->AltBody = 'La configuración SMTP funciona. Enviado ' . date('d/m/Y H:i:s');

    $mail->send();

    echo "  ✓ CORREO ENVIADO\n\n";
    echo "    Revisa la bandeja de {$destino}.\n";
    echo "    Si no aparece en unos minutos, mira en SPAM: eso significaría\n";
    echo "    que faltan los registros SPF y DKIM en el DNS del dominio.\n";
} catch (Exception $err) {
    echo "  ✗ FALLÓ EL ENVÍO\n\n";
    echo "    Motivo: " . trim($mail->ErrorInfo) . "\n\n";
    echo "  Diálogo con el servidor:\n{$registro}\n";
    echo "  {$linea}\n  Causas habituales:\n";
    echo "    · «authentication failed» → usuario o clave mal copiados.\n";
    echo "      En Mailjet el usuario es la API Key y la clave la Secret Key;\n";
    echo "      en Brevo, el SMTP login (…@smtp-brevo.com) y la clave SMTP.\n";
    echo "    · «Permission denied / not activated» → en Brevo hay que pedir\n";
    echo "      al soporte que active el relay SMTP de la cuenta.\n";
    echo "    · «Connection refused» o se queda colgado → el hosting bloquea\n";
    echo "      el puerto. Prueba 465, o 2525 si el proveedor lo ofrece.\n";
    echo "    · «sender not allowed» → MAIL_FROM no está verificado en el\n";
    echo "      panel del proveedor.\n";
    exit(1);
}
