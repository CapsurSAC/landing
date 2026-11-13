<?php
/**
 * Posibles: personas que empezaron el formulario, autorizaron sus datos y no
 * llegaron a enviarlo. Lee storage/posibles/*.json, que escribe
 * api/posible.php. Cuando alguien envía, pasa a Leads y desaparece de aquí.
 * Requiere la sesión del panel (se entra por index.php).
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/panel.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/panel.php';

paginaDelPanel();

const POSIBLES_MAX = 300;

$e = h(...);

// ── Lectura ────────────────────────────────────────────────────────────────
$posibles = [];
foreach (glob($carpetaConfig . '/../storage/posibles/*.json') ?: [] as $ruta) {
    $p = json_decode((string) @file_get_contents($ruta), true);
    if (is_array($p) && !empty($p['actualizado'])) {
        $posibles[] = $p;
    }
}
usort($posibles, static fn ($a, $b) => strcmp((string) $b['actualizado'], (string) $a['actualizado']));

$q = mb_strtolower(trim(texto($_GET['q'] ?? '')));
$filtrados = $q === '' ? $posibles : array_values(array_filter($posibles, static function ($p) use ($q) {
    $texto = mb_strtolower(implode(' ', [$p['nombre'] ?? '', $p['email'] ?? '', $p['whatsapp'] ?? '']));
    return str_contains($texto, $q);
}));

// ── Exportar CSV ───────────────────────────────────────────────────────────
$columnas = ['actualizado', 'creado', 'nombre', 'email', 'whatsapp', 'area', 'objetivo', 'inicio', 'marketing',
    'version_consentimiento', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'pagina'];
if (isset($_GET['exportar'])) {
    exigirReautenticacion('posibles.php?' . http_build_query(array_filter(['q' => $q]) + ['exportar' => 1]), 'exportar los posibles');
    auditar('exportar-posibles', count($filtrados) . ' filas');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="posibles-' . date('Ymd-Hi') . '.csv"');
    $salida = fopen('php://output', 'w');
    fwrite($salida, "\xEF\xBB\xBF"); // BOM: Excel abre bien las tildes
    fputcsv($salida, $columnas);
    foreach ($filtrados as $p) {
        $p['marketing'] = !empty($p['marketing']) ? 'si' : 'no';
        fputcsv($salida, array_map(static fn ($c) => celdaCsv($p[$c] ?? ''), $columnas));
    }
    fclose($salida);
    exit;
}

header('Content-Type: text/html; charset=utf-8');

$zona   = new DateTimeZone('America/Lima');
$hoy    = (new DateTimeImmutable('today', $zona))->format('Y-m-d');
$semana = (new DateTimeImmutable('-6 days', $zona))->format('Y-m-d');
$conContacto = count(array_filter($posibles, static fn ($p) => !empty($p['email_valido']) || !empty($p['whatsapp_valido'])));

$soloDigitos = static fn (string $t): string => preg_replace('/\D+/', '', $t) ?? '';
$origenCorto = static function (array $p): string {
    $partes = array_filter([$p['utm_source'] ?? '', $p['utm_campaign'] ?? '', $p['utm_content'] ?? '']);
    return $partes ? implode(' · ', $partes) : (parse_url($p['pagina'] ?? '', PHP_URL_HOST) ?: '—');
};
?>
<!doctype html>
<html lang="es-PE">
<head>
  <?= cabezaHtml('Posibles') ?>
</head>
<body>
  <?= barraDelPanel('posibles.php') ?>

  <main class="contenido">
    <p class="resumen">
      Personas que llenaron parte del formulario y autorizaron sus datos, pero no lo enviaron.
      Al enviarlo pasan a Leads. Se borran solas tras 90 días sin cambios.
    </p>

    <section class="tarjetas" aria-label="Resumen">
      <div class="tarjeta destacada"><div class="n"><?= count($posibles) ?></div><div class="t">Posibles</div></div>
      <div class="tarjeta"><div class="n"><?= $conContacto ?></div><div class="t">Con correo o WhatsApp válido</div></div>
      <div class="tarjeta"><div class="n"><?= count(array_filter($posibles, static fn ($p) => substr((string) $p['actualizado'], 0, 10) === $hoy)) ?></div><div class="t">Hoy</div></div>
      <div class="tarjeta"><div class="n"><?= count(array_filter($posibles, static fn ($p) => substr((string) $p['actualizado'], 0, 10) >= $semana)) ?></div><div class="t">Últimos 7 días</div></div>
    </section>

    <form class="filtros" method="get" action="posibles.php">
      <div><label for="q">Buscar</label><input id="q" name="q" type="search" value="<?= $e($q) ?>" placeholder="Nombre, correo o WhatsApp" /></div>
      <div class="acciones">
        <button class="btn" type="submit">Filtrar</button>
        <a class="btn sec" href="posibles.php">Limpiar</a>
        <a class="btn sec" href="posibles.php?<?= $e(http_build_query(array_filter(['q' => $q]) + ['exportar' => 1])) ?>">Exportar CSV</a>
      </div>
    </form>

    <p class="resumen">
      <?= count($filtrados) ?> de <?= count($posibles) ?> posibles<?= count($filtrados) > POSIBLES_MAX ? ' · se muestran los ' . POSIBLES_MAX . ' más recientes; exporta para ver el resto' : '' ?>.
    </p>

    <div class="tabla">
      <?php if (!$posibles): ?>
        <div class="vacio">Todavía no hay posibles. Aparecen cuando alguien autoriza sus datos y deja el formulario sin enviar.</div>
      <?php elseif (!$filtrados): ?>
        <div class="vacio">Ningún posible coincide con esa búsqueda.</div>
      <?php else: ?>
      <table class="ancha">
        <thead><tr><th>Última vez</th><th>Nombre</th><th>Contacto</th><th>Área</th><th>Qué busca</th><th>Cuándo</th><th>Marketing</th><th>Origen</th></tr></thead>
        <tbody>
        <?php foreach (array_slice($filtrados, 0, POSIBLES_MAX) as $p): ?>
          <?php $wa = $soloDigitos((string) ($p['whatsapp'] ?? '')); ?>
          <tr>
            <td><?= $e(substr((string) $p['actualizado'], 0, 10)) ?><div class="peq"><?= $e(substr((string) $p['actualizado'], 11, 5)) ?></div></td>
            <td><strong><?= $e(($p['nombre'] ?? '') !== '' ? $p['nombre'] : '—') ?></strong></td>
            <td>
              <?php if (!empty($p['email_valido'])): ?>
                <a href="mailto:<?= $e($p['email']) ?>"><?= $e($p['email']) ?></a>
              <?php elseif (($p['email'] ?? '') !== ''): ?>
                <span title="Correo a medio escribir"><?= $e($p['email']) ?> <span class="no">incompleto</span></span>
              <?php endif; ?>
              <?php if (!empty($p['whatsapp_valido'])): ?>
                <div class="peq"><a href="https://wa.me/<?= $e(strlen($wa) === 9 ? '51' . $wa : $wa) ?>" target="_blank" rel="noopener noreferrer"><?= $e($p['whatsapp']) ?></a></div>
              <?php elseif (($p['whatsapp'] ?? '') !== ''): ?>
                <div class="peq"><?= $e($p['whatsapp']) ?> <span class="no">no válido</span></div>
              <?php endif; ?>
            </td>
            <td><?php if (($p['area'] ?? '') !== ''): ?><span class="etiqueta"><?= $e($p['area']) ?></span><?php else: ?>—<?php endif; ?></td>
            <td><?= $e(($p['objetivo'] ?? '') ?: '—') ?></td>
            <td><?= $e(($p['inicio'] ?? '') ?: '—') ?></td>
            <td><?= !empty($p['marketing']) ? '<span class="si">Sí</span>' : '<span class="no">No</span>' ?></td>
            <td class="peq" title="<?= $e($p['pagina'] ?? '') ?>"><?= $e($origenCorto($p)) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>
  </main>
</body>
</html>
