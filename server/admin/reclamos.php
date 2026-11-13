<?php
/**
 * Libro de Reclamaciones: las hojas que llegan por la web (api/reclamo.php),
 * su plazo de 15 días hábiles y la respuesta del proveedor. Responder queda
 * en la auditoría; si hay SMTP, la respuesta se manda al consumidor.
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/panel.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/panel.php';

paginaDelPanel();

$carpeta = $carpetaConfig . '/../storage/reclamos';
$aviso   = '';

/** Ruta de una hoja a partir de su número, sin dejar salir de la carpeta. */
$rutaDe = static fn (string $numero): ?string =>
    preg_match('/^CAPSUR-\d{4}-\d{6}$/', $numero) && is_file("{$carpeta}/{$numero}.json") ? "{$carpeta}/{$numero}.json" : null;

// ── Responder una hoja ─────────────────────────────────────────────────────
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && texto($_POST['accion'] ?? '') === 'responder') {
    $numero    = texto($_POST['numero'] ?? '');
    $respuesta = mb_substr(trim(str_replace("\r", '', texto($_POST['respuesta'] ?? ''))), 0, 3000);
    $ruta      = $rutaDe($numero);
    if (!csrfValido() || !$ruta || mb_strlen($respuesta) < 10) {
        $aviso = 'No se guardó: escribe una respuesta de al menos 10 caracteres.';
    } else {
        $hoja = json_decode((string) file_get_contents($ruta), true) ?: [];
        $hoja['estado']          = 'respondido';
        $hoja['respuesta']       = $respuesta;
        $hoja['respondido_en']   = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d H:i');
        $hoja['respondido_por']  = env('ADMIN_USUARIO');
        file_put_contents($ruta, json_encode($hoja, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
        auditar('reclamo-respondido', $numero);
        $aviso = "Respuesta guardada en {$numero}.";

        // Si aceptó la respuesta por correo y hay SMTP, sale ya.
        if (!empty($hoja['acepta_correo']) && env('SMTP_HOST') !== '' && is_file($carpetaConfig . '/vendor/autoload.php')) {
            require_once $carpetaConfig . '/vendor/autoload.php';
            try {
                $mail = new PHPMailer\PHPMailer\PHPMailer(true);
                $mail->isSMTP();
                $mail->Host       = env('SMTP_HOST');
                $mail->SMTPAuth   = true;
                $mail->Username   = env('SMTP_USER');
                $mail->Password   = env('SMTP_PASS');
                $mail->Port       = (int) env('SMTP_PORT', '587');
                $mail->SMTPSecure = $mail->Port === 465 ? 'ssl' : 'tls';
                $mail->CharSet    = 'UTF-8';
                $mail->setFrom(env('MAIL_FROM'), env('MAIL_FROM_NOMBRE', 'CAPSUR'));
                $mail->addAddress((string) $hoja['correo'], (string) $hoja['nombre']);
                $mail->Subject = "Respuesta a tu hoja de reclamación {$numero}";
                $mail->Body    = "Hola, {$hoja['nombre']}:\n\nEsta es nuestra respuesta a tu hoja de reclamación {$numero}:\n\n{$respuesta}\n\n" . env('EMPRESA_RAZON_SOCIAL', 'Grupo CAPSUR');
                $mail->send();
                $aviso .= ' Se envió por correo a la persona.';
            } catch (Throwable $err) {
                $aviso .= ' No se pudo enviar por correo: respóndele por otro medio.';
                error_log('CAPSUR: no salió la respuesta del reclamo ' . $numero);
            }
        }
    }
}

// ── Lectura ────────────────────────────────────────────────────────────────
$hojas = [];
foreach (glob($carpeta . '/CAPSUR-*.json') ?: [] as $ruta) {
    $h = json_decode((string) @file_get_contents($ruta), true);
    if (is_array($h)) $hojas[] = $h;
}
usort($hojas, static fn ($a, $b) => strcmp((string) $b['numero'], (string) $a['numero']));
$verTodas   = isset($_GET['todas']);
$pendientes = array_values(array_filter($hojas, static fn ($h) => ($h['estado'] ?? '') !== 'respondido'));
$lista      = $verTodas ? $hojas : $pendientes;
$hoy        = (new DateTimeImmutable('today', new DateTimeZone('America/Lima')))->format('Y-m-d');

header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="es-PE">
<head>
  <?= cabezaHtml('Reclamaciones') ?>
</head>
<body>
  <?= barraDelPanel('reclamos.php') ?>
  <main class="contenido">
    <?php if ($aviso): ?><div class="aviso" role="status"><?= h($aviso) ?></div><?php endif; ?>

    <section class="tarjetas" aria-label="Resumen">
      <div class="tarjeta destacada"><div class="n"><?= count($pendientes) ?></div><div class="t">Por responder</div></div>
      <div class="tarjeta"><div class="n"><?= count(array_filter($pendientes, static fn ($h) => ($h['vence'] ?? '9') < $hoy)) ?></div><div class="t">Fuera de plazo</div></div>
      <div class="tarjeta"><div class="n"><?= count($hojas) ?></div><div class="t">Hojas en total</div></div>
    </section>

    <div class="acciones entre">
      <p class="resumen">Plazo legal: 15 días hábiles desde que llega la hoja. Las hojas se conservan al menos 2 años.</p>
      <a class="btn peq sec" href="reclamos.php<?= $verTodas ? '' : '?todas=1' ?>"><?= $verTodas ? 'Ver solo pendientes' : 'Ver todas' ?></a>
    </div>

    <?php if (!$lista): ?>
      <div class="vacio"><?= $verTodas ? 'Todavía no llegó ninguna hoja.' : 'No hay hojas por responder.' ?></div>
    <?php endif; ?>

    <?php foreach ($lista as $h): ?>
      <?php $vencida = ($h['estado'] ?? '') !== 'respondido' && ($h['vence'] ?? '9') < $hoy; ?>
      <article class="panel reclamo-hoja">
        <h2><?= h($h['numero']) ?> · <?= h($h['tipo']) ?>
          <small><?= h($h['fecha']) ?> · <?= ($h['estado'] ?? '') === 'respondido' ? 'respondida el ' . h($h['respondido_en'] ?? '') : ($vencida ? '<strong class="no">vencida el ' . h($h['vence']) . '</strong>' : 'vence el ' . h($h['vence'] ?? '')) ?></small>
        </h2>
        <p><strong><?= h($h['nombre']) ?></strong> · <?= h($h['tipo_documento'] . ' ' . $h['documento']) ?> · <?= h($h['telefono']) ?> · <a href="mailto:<?= h($h['correo']) ?>"><?= h($h['correo']) ?></a><?= !empty($h['menor']) ? ' · menor de edad, apoderado: ' . h($h['apoderado']) : '' ?></p>
        <p class="peq"><?= h($h['domicilio']) ?></p>
        <p><strong><?= h($h['bien']) ?>:</strong> <?= h($h['descripcion_bien']) ?><?= ($h['monto'] ?? '') !== '' ? ' · S/ ' . h($h['monto']) : '' ?></p>
        <p><strong>Detalle:</strong> <?= nl2br(h($h['detalle'])) ?></p>
        <p><strong>Pedido:</strong> <?= nl2br(h($h['pedido'])) ?></p>
        <?php if (($h['estado'] ?? '') === 'respondido'): ?>
          <p><strong>Respuesta:</strong> <?= nl2br(h($h['respuesta'] ?? '')) ?></p>
        <?php else: ?>
          <form method="post" action="reclamos.php" class="filtros">
            <input type="hidden" name="accion" value="responder" />
            <input type="hidden" name="csrf" value="<?= h(csrf()) ?>" />
            <input type="hidden" name="numero" value="<?= h($h['numero']) ?>" />
            <div style="grid-column:1/-1"><label for="r-<?= h($h['numero']) ?>">Respuesta del proveedor</label>
              <textarea id="r-<?= h($h['numero']) ?>" name="respuesta" rows="4" required minlength="10" maxlength="3000" style="width:100%;font:inherit;padding:8px;border:1px solid #cbd5e1;border-radius:10px"></textarea></div>
            <div class="acciones"><button class="btn" type="submit">Guardar respuesta<?= !empty($h['acepta_correo']) ? ' y enviarla por correo' : '' ?></button></div>
          </form>
        <?php endif; ?>
      </article>
    <?php endforeach; ?>
  </main>
</body>
</html>
