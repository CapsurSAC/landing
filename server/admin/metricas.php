<?php
/**
 * Métricas de uso de la landing: de dónde vienen, qué miran, qué tocan,
 * hasta dónde llegan en el formulario, qué eligen, cuándo entran y quién se
 * quedó a medias. Mapa de calor sobre la propia landing y exportación a CSV.
 *
 * Lee storage/visitas/*.json y storage/eventos.csv, que escribe
 * api/metricas.php. Requiere la sesión del panel (se entra por index.php).
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/panel.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/panel.php';

paginaDelPanel();

$almacen = $carpetaConfig . '/../storage';
$e = h(...);

$zona = new DateTimeZone('America/Lima');
$dias = (int) ($_GET['dias'] ?? 30);
if (!in_array($dias, [7, 30, 90], true)) {
    $dias = 30;
}
$hoy   = new DateTimeImmutable('today', $zona);
$desde = $hoy->modify('-' . ($dias - 1) . ' days')->format('Y-m-d');

$CAMPOS = [
    'area'           => '1. Área de interés',
    'objetivo'       => '2. Qué busca',
    'inicio'         => '3. Cuándo empezar',
    'nombre'         => 'Nombre',
    'email'          => 'Correo',
    'whatsapp'       => 'WhatsApp (opcional)',
    'consentimiento' => 'Autorización de datos',
];
$SECCIONES = ['inicio' => 'Portada', 'instituciones' => 'Instituciones', 'porque' => '¿Por qué CAPSUR?', 'programas' => 'Programas', 'formulario' => 'Formulario'];
$NOMBRE_SECCION = $SECCIONES + ['header' => 'Cabecera', 'footer' => 'Pie', 'pagina' => 'Resto de la página'];
$DIAS_SEMANA = [1 => 'Lun', 2 => 'Mar', 3 => 'Mié', 4 => 'Jue', 5 => 'Vie', 6 => 'Sáb', 0 => 'Dom'];
$ETIQUETA_ESTADO = ['visito' => 'Solo visitó', 'a_medias' => 'A medias', 'completo' => 'Completó'];

$estadoDe = static function (array $v): string {
    if (!empty($v['envio'])) return 'completo';
    return array_filter($v['campos'] ?? []) ? 'a_medias' : 'visito';
};
/** Deja la visita con los tipos que el resto de la página da por hechos: un archivo raro no tumba el panel. */
$normalizar = static function (array $v): array {
    foreach (['campos', 'respuestas', 'errores', 'secciones'] as $c) {
        $v[$c] = array_filter(is_array($v[$c] ?? null) ? $v[$c] : [], 'is_scalar');
    }
    foreach (['inicio', 'ultima', 'envio_en', 'dispositivo', 'so', 'navegador', 'fuente', 'medio', 'campana', 'anuncio',
              'referente', 'idioma', 'ultimo_campo', 'nombre', 'correo', 'pagina'] as $c) {
        if (isset($v[$c]) && !is_string($v[$c])) {
            $v[$c] = is_scalar($v[$c]) ? (string) $v[$c] : '';
        }
    }
    return $v;
};
$pct    = static fn (int|float $n, int|float $base): int => $base ? (int) round($n / $base * 100) : 0;
$fmtSeg = static fn (int $s): string => $s >= 60 ? intdiv($s, 60) . ' min ' . ($s % 60) . ' s' : $s . ' s';

// ── Visitas del periodo ────────────────────────────────────────────────────
$visitas = [];
$desdeUnix = (new DateTimeImmutable($desde, $zona))->getTimestamp();
foreach (glob($almacen . '/visitas/*.json') ?: [] as $archivo) {
    // Una visita que no se toca desde antes del periodo empezó antes: ni se abre.
    if ((int) @filemtime($archivo) < $desdeUnix) {
        continue;
    }
    $v = json_decode((string) @file_get_contents($archivo), true);
    if (!is_array($v)) {
        continue;
    }
    $v = $normalizar($v);
    if (substr($v['inicio'] ?? '', 0, 10) >= $desde) {
        $v['estado'] = $estadoDe($v);
        $visitas[] = $v;
    }
}
usort($visitas, static fn (array $a, array $b): int => strcmp($b['inicio'] ?? '', $a['inicio'] ?? ''));

// ── Exportar CSV (una fila por visita) ─────────────────────────────────────
if (isset($_GET['exportar'])) {
    // Trae nombre, correo y WhatsApp de quien autorizó: son datos personales.
    exigirReautenticacion('metricas.php?dias=' . $dias . '&exportar=1', 'exportar las visitas');
    auditar('exportar-visitas', $dias . ' días');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="visitas-' . $dias . 'dias-' . date('Ymd-Hi') . '.csv"');
    $salida = fopen('php://output', 'w');
    fwrite($salida, "\xEF\xBB\xBF");
    fputcsv($salida, ['inicio', 'ultima', 'estado', 'dispositivo', 'sistema', 'navegador', 'ancho', 'fuente', 'medio', 'campana', 'anuncio', 'referente', 'recurrente', 'idioma', 'tiempo_seg', 'scroll_pct', 'seg_portada', 'seg_instituciones', 'seg_porque', 'seg_formulario', 'area', 'objetivo', 'cuando', 'ultimo_campo', 'errores', 'consintio', 'nombre', 'correo', 'pagina']);
    foreach ($visitas as $v) {
        $err = [];
        foreach ($v['errores'] ?? [] as $c => $n) $err[] = "$c:$n";
        fputcsv($salida, array_map('celdaCsv', [
            $v['inicio'] ?? '', $v['ultima'] ?? '', $ETIQUETA_ESTADO[$v['estado']], $v['dispositivo'] ?? '', $v['so'] ?? '', $v['navegador'] ?? '', $v['ancho'] ?? '',
            $v['fuente'] ?? '', $v['medio'] ?? '', $v['campana'] ?? '', $v['anuncio'] ?? '', $v['referente'] ?? '', !empty($v['recurrente']) ? 'si' : 'no', $v['idioma'] ?? '',
            $v['tiempo'] ?? 0, $v['scroll'] ?? 0,
            $v['secciones']['inicio'] ?? 0, $v['secciones']['instituciones'] ?? 0, $v['secciones']['porque'] ?? 0, $v['secciones']['formulario'] ?? 0,
            $v['respuestas']['area'] ?? '', $v['respuestas']['objetivo'] ?? '', $v['respuestas']['inicio'] ?? '', $v['ultimo_campo'] ?? '', implode(';', $err),
            !empty($v['consintio']) ? 'si' : 'no', $v['nombre'] ?? '', $v['correo'] ?? '', $v['pagina'] ?? '',
        ]));
    }
    fclose($salida);
    exit;
}

// ── Agregados ──────────────────────────────────────────────────────────────
$total = count($visitas);
$porEstado = ['visito' => 0, 'a_medias' => 0, 'completo' => 0];
$porDisp   = ['movil' => 0, 'tablet' => 0, 'escritorio' => 0];
$porSo = []; $porNav = []; $porCampo = array_fill_keys(array_keys($CAMPOS), 0);
$porDia = [];
for ($d = new DateTimeImmutable($desde, $zona); $d <= $hoy; $d = $d->modify('+1 day')) {
    $porDia[$d->format('Y-m-d')] = ['v' => 0, 'l' => 0];
}
$fuentes = []; $respuestas = ['area' => [], 'objetivo' => [], 'inicio' => []];
$ultimoCampo = []; $errores = []; $seccionVista = array_fill_keys(array_keys($SECCIONES), ['n' => 0, 'seg' => 0]);
$scrollSum = 0; $scrollTramos = ['Menos del 25 %' => 0, '25 a 49 %' => 0, '50 a 74 %' => 0, '75 a 99 %' => 0, 'Toda la página' => 0];
$tiempoSum = 0; $recurrentes = 0; $envioSegSum = 0; $envioN = 0;
$horas = array_fill(0, 7, array_fill(0, 24, 0)); $maxHora = 0;

foreach ($visitas as $v) {
    $est = $v['estado'];
    $porEstado[$est]++;
    $lead = $est === 'completo' ? 1 : 0;

    $d = $v['dispositivo'] ?? 'escritorio';
    $porDisp[$d] = ($porDisp[$d] ?? 0) + 1;
    $so = $v['so'] ?? 'Otro';           $porSo[$so]  = ($porSo[$so] ?? 0) + 1;
    $nav = $v['navegador'] ?? 'Otro';   $porNav[$nav] = ($porNav[$nav] ?? 0) + 1;
    if (!empty($v['recurrente'])) $recurrentes++;

    $dia = substr($v['inicio'] ?? '', 0, 10);
    if (isset($porDia[$dia])) { $porDia[$dia]['v']++; $porDia[$dia]['l'] += $lead; }

    $t = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $v['inicio'] ?? '', $zona);
    if ($t) { $n = ++$horas[(int) $t->format('w')][(int) $t->format('G')]; $maxHora = max($maxHora, $n); }

    $kf = ($v['fuente'] ?? 'directo') . '|' . ($v['medio'] ?? '') . '|' . ($v['campana'] ?? '');
    $fuentes[$kf] ??= ['fuente' => $v['fuente'] ?? 'directo', 'medio' => $v['medio'] ?? '', 'campana' => $v['campana'] ?? '', 'v' => 0, 'm' => 0, 'l' => 0];
    $fuentes[$kf]['v']++; $fuentes[$kf]['l'] += $lead; if ($est === 'a_medias') $fuentes[$kf]['m']++;

    foreach ($v['campos'] ?? [] as $campo => $lleno) if ($lleno && isset($porCampo[$campo])) $porCampo[$campo]++;
    foreach ($v['respuestas'] ?? [] as $campo => $texto) {
        if (!isset($respuestas[$campo])) continue;
        $respuestas[$campo][$texto] ??= ['v' => 0, 'l' => 0];
        $respuestas[$campo][$texto]['v']++; $respuestas[$campo][$texto]['l'] += $lead;
    }
    if ($est === 'a_medias' && !empty($v['ultimo_campo'])) $ultimoCampo[$v['ultimo_campo']] = ($ultimoCampo[$v['ultimo_campo']] ?? 0) + 1;
    foreach ($v['errores'] ?? [] as $campo => $n) $errores[$campo] = ($errores[$campo] ?? 0) + (int) $n;

    foreach ($v['secciones'] ?? [] as $id => $seg) {
        if (isset($seccionVista[$id]) && $seg >= 1) { $seccionVista[$id]['n']++; $seccionVista[$id]['seg'] += (int) $seg; }
    }
    $sc = (int) ($v['scroll'] ?? 0); $scrollSum += $sc;
    $scrollTramos[$sc >= 100 ? 'Toda la página' : ($sc >= 75 ? '75 a 99 %' : ($sc >= 50 ? '50 a 74 %' : ($sc >= 25 ? '25 a 49 %' : 'Menos del 25 %')))]++;
    $tiempoSum += (int) ($v['tiempo'] ?? 0);

    if ($lead && !empty($v['envio_en']) && $t) {
        $fin = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $v['envio_en'], $zona);
        if ($fin) { $envioSegSum += max(0, $fin->getTimestamp() - $t->getTimestamp()); $envioN++; }
    }
}
$empezaron = $porEstado['a_medias'] + $porEstado['completo'];
arsort($porSo); arsort($porNav); arsort($ultimoCampo); arsort($errores);
usort($fuentes, static fn ($a, $b) => $b['v'] <=> $a['v']);
foreach ($respuestas as &$lista) { uasort($lista, static fn ($a, $b) => $b['v'] <=> $a['v']); $lista = array_slice($lista, 0, 8, true); }
unset($lista);

$recuperables = array_values(array_filter($visitas, static fn (array $v) =>
    $v['estado'] === 'a_medias' && !empty($v['consintio']) && (!empty($v['correo']) || !empty($v['nombre']))
));
usort($recuperables, static fn (array $a, array $b): int => strcmp($b['ultima'] ?? '', $a['ultima'] ?? ''));

// ── Clics ──────────────────────────────────────────────────────────────────
$porElemento = []; $porSeccion = []; $clicsTotal = 0;
if ($f = @fopen($almacen . '/eventos.csv', 'r')) {
    fgetcsv($f);
    while (($r = fgetcsv($f)) !== false) {
        if (count($r) < 8 || $r[0] === 'fecha' || $r[0] < $desde) continue; // 'fecha': cabecera repetida
        $clicsTotal++;
        $seccion = $r[3] !== '' ? $r[3] : 'pagina';
        $clave   = $seccion . ' › ' . $r[4];
        $porElemento[$clave] = ($porElemento[$clave] ?? 0) + 1;
        $porSeccion[$seccion] = ($porSeccion[$seccion] ?? 0) + 1;
    }
    fclose($f);
}
arsort($porElemento); arsort($porSeccion);
$topElementos = array_slice($porElemento, 0, 20, true);
$maxSeccion   = $porSeccion ? max($porSeccion) : 0;
$nombreSeccion = static fn (string $s): string => $NOMBRE_SECCION[$s] ?? $s;

/** Gráfico de barras por día: visitas en azul, leads en verde. */
function graficoDiario(array $porDia): string
{
    $n = count($porDia);
    if (!$n) return '';
    $w = 720; $h = 170; $pad = 26; $alto = $h - 2 * $pad;
    $maxV = max(1, max(array_column($porDia, 'v')));
    $bw = ($w - 2 * $pad) / $n;
    $cada = max(1, (int) ceil($n / 10));
    $svg = "<svg viewBox='0 0 $w $h' class='grafico' role='img' aria-label='Visitas y leads por día'>";
    $svg .= "<text x='$pad' y='14' font-size='10' fill='#4a5568'>máximo diario: $maxV visitas</text>";
    $i = 0;
    foreach ($porDia as $dia => $d) {
        $x  = $pad + $i * $bw;
        $hv = $d['v'] / $maxV * $alto;
        $hl = $d['l'] / $maxV * $alto;
        $ancho = max(1, $bw - 2);
        $svg .= sprintf("<rect x='%.1f' y='%.1f' width='%.1f' height='%.1f' rx='2' fill='#1668c9' opacity='.8'><title>%s: %d visitas</title></rect>", $x + 1, $h - $pad - $hv, $ancho, $hv, $dia, $d['v']);
        $svg .= sprintf("<rect x='%.1f' y='%.1f' width='%.1f' height='%.1f' rx='2' fill='#059669'><title>%s: %d leads</title></rect>", $x + 1, $h - $pad - $hl, $ancho, $hl, $dia, $d['l']);
        if ($i % $cada === 0) {
            $svg .= sprintf("<text x='%.1f' y='%d' font-size='10' text-anchor='middle' fill='#4a5568'>%s</text>", $x + $bw / 2, $h - 8, substr($dia, 8, 2) . '/' . substr($dia, 5, 2));
        }
        $i++;
    }
    return $svg . '</svg>';
}

/** Lista de barras: [etiqueta => n] contra un máximo y una base para el %. */
function barras(array $datos, int $base, callable $e, ?array $extra = null): string
{
    if (!$datos) return '<div class="vacio">Sin datos en este periodo.</div>';
    $max = max(1, max($datos));
    $html = '';
    foreach ($datos as $k => $n) {
        $p = $base ? (int) round($n / $base * 100) : 0;
        $det = $extra && isset($extra[$k]) ? ' <small>· ' . $e($extra[$k]) . '</small>' : '';
        $html .= '<div class="fila-barra"><span class="nombre">' . $e($k) . '</span><div class="pista"><div class="relleno" style="width:' . (int) round($n / $max * 100) . '%"></div></div><span class="valor">' . $n . ' <small>· ' . $p . '%</small>' . $det . '</span></div>';
    }
    return $html;
}

header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="es-PE">
<head>
  <?= cabezaHtml('Métricas') ?>
</head>
<body>
  <?= barraDelPanel('metricas.php') ?>

  <main class="contenido">
    <div class="acciones entre">
      <div class="acciones">
        <?php foreach ([7 => 'Últimos 7 días', 30 => 'Últimos 30 días', 90 => 'Últimos 90 días'] as $n => $texto): ?>
          <a class="btn peq<?= $n === $dias ? '' : ' sec' ?>" href="metricas.php?dias=<?= $n ?>"><?= $texto ?></a>
        <?php endforeach; ?>
      </div>
      <a class="btn peq sec" href="metricas.php?dias=<?= $dias ?>&amp;exportar=1">Exportar visitas (CSV)</a>
    </div>

    <?php if ($total === 0): ?>
      <div class="vacio panel">
        Todavía no hay visitas medidas en este periodo. La landing empieza a registrar en cuanto se publica con esta versión.
      </div>
    <?php else: ?>

    <section class="tarjetas" aria-label="Resumen de visitas">
      <div class="tarjeta destacada"><div class="n"><?= $total ?></div><div class="t">Visitas · <?= $pct($recurrentes, $total) ?>% ya habían venido</div></div>
      <div class="tarjeta"><div class="n"><?= $empezaron ?><small><?= $pct($empezaron, $total) ?>%</small></div><div class="t">Empezaron el formulario</div></div>
      <div class="tarjeta"><div class="n"><?= $porEstado['a_medias'] ?><small><?= $pct($porEstado['a_medias'], $empezaron) ?>%</small></div><div class="t">Lo dejaron a medias · sobre los que empezaron</div></div>
      <div class="tarjeta"><div class="n"><?= $porEstado['completo'] ?><small><?= $pct($porEstado['completo'], $total) ?>%</small></div><div class="t">Leads · conversión sobre visitas</div></div>
      <div class="tarjeta"><div class="n"><?= $fmtSeg((int) round($tiempoSum / $total)) ?></div><div class="t">Tiempo medio activo en la página</div></div>
      <div class="tarjeta"><div class="n"><?= (int) round($scrollSum / $total) ?><small>%</small></div><div class="t">Scroll medio · hasta dónde bajan</div></div>
      <div class="tarjeta"><div class="n"><?= $envioN ? $fmtSeg((int) round($envioSegSum / $envioN)) : '—' ?></div><div class="t">Tiempo medio hasta enviar</div></div>
    </section>

    <h2>Visitas y leads por día <small>azul visitas · verde leads</small></h2>
    <div class="panel"><?= graficoDiario($porDia) ?></div>

    <div class="dos">
      <div>
        <h2>De dónde vienen <small>fuente · medio · campaña</small></h2>
        <div class="tabla">
          <table>
            <thead><tr><th>Origen</th><th class="num">Visitas</th><th class="num">A medias</th><th class="num">Leads</th><th class="num">Conv.</th></tr></thead>
            <tbody>
            <?php foreach (array_slice($fuentes, 0, 12) as $f): ?>
              <tr>
                <td><strong><?= $e($f['fuente']) ?></strong><?php if ($f['medio'] !== '' || $f['campana'] !== ''): ?><div class="peq"><?= $e(trim($f['medio'] . ' · ' . $f['campana'], ' ·')) ?></div><?php endif; ?></td>
                <td class="num"><?= $f['v'] ?></td>
                <td class="num"><?= $f['m'] ?></td>
                <td class="num"><strong><?= $f['l'] ?></strong></td>
                <td class="num"><?= $pct($f['l'], $f['v']) ?>%</td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
        <p class="peq" style="margin:8px 2px">Para que salga la campaña, los enlaces de los anuncios deben llevar <code>utm_source</code>, <code>utm_medium</code> y <code>utm_campaign</code>. Sin UTM, Facebook se detecta por <code>fbclid</code> y el resto por el sitio de procedencia.</p>
      </div>
      <div>
        <h2>Cuándo entran <small>visitas por día de la semana y hora</small></h2>
        <div class="panel" style="overflow:auto">
          <table class="rejilla-horas" aria-label="Visitas por día y hora">
            <thead><tr><th></th><?php for ($h = 0; $h < 24; $h++): ?><th><?= $h % 3 === 0 ? $h : '' ?></th><?php endfor; ?></tr></thead>
            <tbody>
            <?php foreach ($DIAS_SEMANA as $dow => $nombre): ?>
              <tr><th><?= $nombre ?></th>
              <?php for ($h = 0; $h < 24; $h++): $n = $horas[$dow][$h]; ?>
                <td style="background:rgba(22,104,201,<?= $maxHora ? max(0.06, $n / $maxHora) : 0.06 ?>)" title="<?= $nombre ?> <?= $h ?>h: <?= $n ?> visitas"></td>
              <?php endfor; ?>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
          <p class="peq" style="margin:10px 2px 0">Más oscuro, más visitas. Útil para elegir a qué horas pautar y cuándo tener asesores atentos al WhatsApp.</p>
        </div>
      </div>
    </div>

    <div class="dos">
      <div>
        <h2>Embudo del formulario <small>visitas que llenaron cada campo</small></h2>
        <div class="barras">
          <?php foreach ($CAMPOS as $campo => $nombre): ?>
            <div class="fila-barra">
              <span class="nombre"><?= $e($nombre) ?></span>
              <div class="pista"><div class="relleno" style="width:<?= $pct($porCampo[$campo], $total) ?>%"></div></div>
              <span class="valor"><?= $porCampo[$campo] ?> <small>· <?= $pct($porCampo[$campo], $total) ?>%</small></span>
            </div>
          <?php endforeach; ?>
          <div class="fila-barra">
            <span class="nombre">Enviado</span>
            <div class="pista"><div class="relleno" style="width:<?= $pct($porEstado['completo'], $total) ?>%;background:linear-gradient(90deg,#059669,#047857)"></div></div>
            <span class="valor"><?= $porEstado['completo'] ?> <small>· <?= $pct($porEstado['completo'], $total) ?>%</small></span>
          </div>
        </div>
      </div>
      <div>
        <h2>Dónde se atascan <small>último campo tocado antes de irse · errores de validación</small></h2>
        <div class="barras">
          <?= barras(array_combine(array_map(static fn ($c) => $CAMPOS[$c] ?? $c, array_keys($ultimoCampo)), $ultimoCampo) ?: [], $porEstado['a_medias'], $e) ?>
        </div>
        <?php if ($errores): ?>
          <p class="peq" style="margin:10px 2px 4px">Errores de validación al intentar enviar:</p>
          <div class="barras"><?= barras(array_combine(array_map(static fn ($c) => $CAMPOS[$c] ?? $c, array_keys($errores)), $errores) ?: [], array_sum($errores), $e) ?></div>
        <?php endif; ?>
      </div>
    </div>

    <h2>Qué les interesa <small>respuestas elegidas, aunque no hayan enviado · entre paréntesis, cuántas acabaron en lead</small></h2>
    <div class="tres">
      <?php foreach (['area' => '1. Área de interés', 'objetivo' => '2. Qué busca', 'inicio' => '3. Cuándo empezar'] as $campo => $titulo): ?>
        <div>
          <p class="subtitulo"><?= $titulo ?></p>
          <div class="barras">
            <?= barras(array_map(static fn ($d) => $d['v'], $respuestas[$campo]), $porCampo[$campo], $e, array_map(static fn ($d) => $d['l'] . ' leads', $respuestas[$campo])) ?>
          </div>
        </div>
      <?php endforeach; ?>
    </div>

    <div class="dos">
      <div>
        <h2>Qué secciones miran <small>visitas que las vieron al menos 1 s · tiempo medio</small></h2>
        <div class="barras">
          <?php foreach ($SECCIONES as $id => $nombre): $sv = $seccionVista[$id]; ?>
            <div class="fila-barra">
              <span class="nombre"><?= $e($nombre) ?></span>
              <div class="pista"><div class="relleno" style="width:<?= $pct($sv['n'], $total) ?>%"></div></div>
              <span class="valor"><?= $pct($sv['n'], $total) ?>% <small>· <?= $sv['n'] ? $fmtSeg((int) round($sv['seg'] / $sv['n'])) : '—' ?></small></span>
            </div>
          <?php endforeach; ?>
        </div>
        <p class="subtitulo">Hasta dónde bajan</p>
        <div class="barras"><?= barras($scrollTramos, $total, $e) ?></div>
      </div>
      <div>
        <h2>Dónde hacen clic <small><?= $clicsTotal ?> clics por sección</small></h2>
        <div class="barras">
          <?php if (!$porSeccion): ?><div class="vacio">Sin clics registrados aún.</div><?php endif; ?>
          <?php foreach ($porSeccion as $s => $n): ?>
            <div class="fila-barra">
              <span class="nombre"><?= $e($nombreSeccion($s)) ?></span>
              <div class="pista"><div class="relleno" style="width:<?= $pct($n, $maxSeccion) ?>%"></div></div>
              <span class="valor"><?= $n ?> <small>· <?= $pct($n, $clicsTotal) ?>%</small></span>
            </div>
          <?php endforeach; ?>
        </div>
        <div class="nota">
          <strong>Mapa de calor sobre la página</strong> (últimos 30 días). Ábrelo con una ventana del tamaño correspondiente:
          <a href="/?mapa=escritorio" target="_blank" rel="noopener">Escritorio</a> ·
          <a href="/?mapa=tablet" target="_blank" rel="noopener">Tablet</a> ·
          <a href="/?mapa=movil" target="_blank" rel="noopener">Móvil</a>
        </div>
        <p class="subtitulo">Dispositivos</p>
        <div class="barras">
          <?= barras(['Móvil' => $porDisp['movil'], 'Tablet' => $porDisp['tablet'], 'PC' => $porDisp['escritorio']], $total, $e) ?>
        </div>
        <div class="dos" style="margin-top:10px">
          <div class="barras"><?= barras(array_slice($porSo, 0, 5, true), $total, $e) ?></div>
          <div class="barras"><?= barras(array_slice($porNav, 0, 5, true), $total, $e) ?></div>
        </div>
      </div>
    </div>

    <h2>Lo que más tocan <small>top 20 elementos</small></h2>
    <div class="tabla">
      <?php if (!$topElementos): ?><div class="vacio">Sin clics registrados aún.</div><?php else: ?>
      <table>
        <thead><tr><th>#</th><th>Sección</th><th>Elemento</th><th class="num">Clics</th></tr></thead>
        <tbody>
        <?php $i = 0; foreach ($topElementos as $clave => $n): [$s, $el] = explode(' › ', $clave, 2) + [1 => '']; ?>
          <tr>
            <td class="num"><?= ++$i ?></td>
            <td><span class="etiqueta"><?= $e($nombreSeccion($s)) ?></span></td>
            <td><?= $e($el) ?></td>
            <td class="num"><strong><?= $n ?></strong> <span class="peq">· <?= $pct($n, $clicsTotal) ?>%</span></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>

    <h2>Se quedaron a medias y autorizaron el contacto <small><?= count($recuperables) ?> personas</small></h2>
    <p class="resumen">Marcaron la casilla de autorización pero no pulsaron enviar. Los que no la marcaron cuentan en el embudo, pero sin nombre ni correo, como exige la Ley 29733.</p>
    <div class="tabla">
      <?php if (!$recuperables): ?><div class="vacio">Nadie en este periodo.</div><?php else: ?>
      <table class="ancha">
        <thead><tr><th>Última actividad</th><th>Nombre</th><th>Correo</th><th>Respuestas</th><th>Se quedó en</th><th>Origen</th><th>Dispositivo</th></tr></thead>
        <tbody>
        <?php foreach (array_slice($recuperables, 0, 200) as $v): ?>
          <tr>
            <td><?= $e(substr($v['ultima'] ?? '', 0, 16)) ?></td>
            <td><strong><?= $e($v['nombre'] ?? '—') ?></strong></td>
            <td><?php if (!empty($v['correo'])): ?><a href="mailto:<?= $e($v['correo']) ?>"><?= $e($v['correo']) ?></a><?php else: ?>—<?php endif; ?></td>
            <td class="peq"><?= $e(implode(' · ', $v['respuestas'] ?? [])) ?: '—' ?></td>
            <td class="peq"><?= $e($CAMPOS[$v['ultimo_campo'] ?? ''] ?? ($v['ultimo_campo'] ?? '—')) ?></td>
            <td class="peq"><?= $e($v['fuente'] ?? 'directo') ?><?= !empty($v['campana']) ? ' · ' . $e($v['campana']) : '' ?></td>
            <td class="peq"><?= $e($v['dispositivo'] ?? '') ?> · <?= $e($v['so'] ?? '') ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>

    <?php endif; ?>
  </main>
</body>
</html>
