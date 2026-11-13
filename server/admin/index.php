<?php
/**
 * Panel de leads de la landing CAPSUR.
 *
 * Sube la carpeta server/admin/ a public_html/admin/. Lee storage/leads.csv
 * (fuera de public_html) y exige las credenciales definidas en config/.env:
 *
 *   ADMIN_USUARIO=correo@dominio.com
 *   ADMIN_HASH=$argon2id$...      ← php config/generar-hash.php "contraseña"
 *
 * Protecciones: contraseña solo como hash, 5 intentos fallidos por IP cada 15
 * minutos (la IP real, no la que diga una cabecera), sesión HttpOnly + Secure +
 * SameSite=Strict que caduca a las 2 horas, identificador renovado al entrar,
 * token CSRF para salir, el mismo mensaje de error con usuario o contraseña
 * incorrectos, y una política de contenido que no deja ejecutar scripts.
 */
declare(strict_types=1);

// La configuración vive FUERA de public_html en cPanel (dos niveles arriba) y
// en server/config dentro del repositorio (un nivel arriba).
$carpetaConfig = is_file(__DIR__ . '/../../config/bootstrap-min.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/bootstrap-min.php';

$archivoLeads = $carpetaConfig . '/../storage/leads.csv';

header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
// El panel no usa scripts, marcos ni recursos de terceros salvo la tipografía:
// todo lo demás queda prohibido, por si algún dato de un visitante llegara a
// pintarse sin escapar.
header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

$usuarioAdmin = env('ADMIN_USUARIO');
$hashAdmin    = env('ADMIN_HASH');
$configurado  = $usuarioAdmin !== '' && $hashAdmin !== '';

const INTENTOS_MAX     = 5;
const INTENTOS_VENTANA = 900; // 15 minutos
const FILAS_MAX        = 300;

// ── Sesión (compartida con metricas.php y api/metricas.php) ────────────────
sesionPanel();

// La ruta de esta página, para los action y las redirecciones. Viene de la
// petición, así que solo se acepta una ruta local corriente: con "//otro.com"
// el formulario de acceso enviaría la contraseña a otro servidor.
$rutaBase = (string) preg_replace('#/{2,}#', '/', strtok((string) ($_SERVER['REQUEST_URI'] ?? ''), '?') ?: '');
if (!preg_match('#^/[A-Za-z0-9._~/-]*$#', $rutaBase)) {
    $rutaBase = '/admin/';
}
$ip       = ipVisitante();
$aviso    = '';

if (!empty($_SESSION['caducada'])) {
    unset($_SESSION['caducada']);
    $aviso = 'La sesión caducó. Vuelve a entrar.';
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = $metodo === 'POST' ? texto($_POST['accion'] ?? '') : '';

// ── Salir ──────────────────────────────────────────────────────────────────
if ($accion === 'salir') {
    if (hash_equals($_SESSION['csrf'] ?? '', texto($_POST['csrf'] ?? ''))) {
        session_unset();
        session_destroy();
    }
    header('Location: ' . $rutaBase, true, 303);
    exit;
}

// ── Entrar ─────────────────────────────────────────────────────────────────
if ($accion === 'entrar') {
    // El límite de intentos reutiliza el contador por IP del formulario,
    // con una clave propia para no mezclar las cuentas.
    $claveLimite = 'panel-login:' . ipParaLimite($ip);

    if (!$configurado) {
        $aviso = 'El panel no está configurado todavía (faltan ADMIN_USUARIO y ADMIN_HASH en el .env).';
    } elseif (!registrarSiCabe($claveLimite, INTENTOS_VENTANA, INTENTOS_MAX)) {
        // El intento se anota ANTES de comprobar la contraseña: si se anotara
        // después, cien intentos lanzados a la vez pasarían todos el límite.
        $aviso = 'Demasiados intentos. Espera 15 minutos antes de volver a probar.';
    } else {
        $usuario = texto($_POST['usuario'] ?? '');
        $clave   = texto($_POST['clave'] ?? '');
        // Se comprueban ambos siempre, para que el tiempo de respuesta no delate cuál falló.
        $usuarioOk = hash_equals($usuarioAdmin, $usuario);
        $claveOk   = password_verify($clave, $hashAdmin);

        if ($usuarioOk && $claveOk) {
            @unlink(archivoLimite($claveLimite)); // entrar bien no gasta intentos
            session_regenerate_id(true);
            $_SESSION['admin']  = true;
            $_SESSION['inicio'] = time();
            $_SESSION['csrf']   = bin2hex(random_bytes(16));
            header('Location: ' . $rutaBase, true, 303);
            exit;
        }
        usleep(400000);
        $aviso = 'Usuario o contraseña incorrectos.';
    }
}

$autenticado = !empty($_SESSION['admin']);
$e = static fn (mixed $t): string => htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8');

// ── Datos ──────────────────────────────────────────────────────────────────

/** Lee el CSV y devuelve las filas más recientes primero. */
function leerLeads(string $archivo): array
{
    if (!is_readable($archivo)) {
        return [];
    }
    $f = fopen($archivo, 'r');
    if (!$f) {
        return [];
    }
    $cabecera = fgetcsv($f);
    $filas    = [];
    if (is_array($cabecera)) {
        while (($fila = fgetcsv($f)) !== false) {
            // Un archivo creado antes de sumar las columnas de UTM tiene la
            // cabecera vieja y, después, filas con las columnas nuevas.
            $columnas = match (count($fila)) {
                count($cabecera)      => $cabecera,
                count(COLUMNAS_LEADS) => COLUMNAS_LEADS,
                default               => null,
            };
            if ($columnas === null) {
                continue; // fila dañada: se omite, no se rompe el panel
            }
            $filas[] = array_combine($columnas, $fila);
        }
    }
    fclose($f);
    // Más recientes primero, por fecha y no por posición en el archivo.
    usort($filas, static fn (array $a, array $b): int => strcmp($b['fecha'] ?? '', $a['fecha'] ?? ''));
    return $filas;
}

$filtros = [
    'q'     => trim(texto($_GET['q'] ?? '')),
    'area'  => trim(texto($_GET['area'] ?? '')),
    'desde' => preg_match('/^\d{4}-\d{2}-\d{2}$/', texto($_GET['desde'] ?? '')) ? $_GET['desde'] : '',
    'hasta' => preg_match('/^\d{4}-\d{2}-\d{2}$/', texto($_GET['hasta'] ?? '')) ? $_GET['hasta'] : '',
];

$leads   = $autenticado ? leerLeads($archivoLeads) : [];
$areas   = array_values(array_unique(array_filter(array_column($leads, 'area'))));
sort($areas, SORT_LOCALE_STRING);

$hoy      = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d');
$hace7    = (new DateTimeImmutable('-6 days', new DateTimeZone('America/Lima')))->format('Y-m-d');
$totales  = ['total' => count($leads), 'hoy' => 0, 'semana' => 0, 'porArea' => []];
foreach ($leads as $l) {
    $dia = substr($l['fecha'] ?? '', 0, 10);
    if ($dia === $hoy)   $totales['hoy']++;
    if ($dia >= $hace7)  $totales['semana']++;
    $a = $l['area'] ?: 'Sin área';
    $totales['porArea'][$a] = ($totales['porArea'][$a] ?? 0) + 1;
}
arsort($totales['porArea']);

$filtrados = array_values(array_filter($leads, static function (array $l) use ($filtros): bool {
    $dia = substr($l['fecha'] ?? '', 0, 10);
    if ($filtros['area'] !== '' && ($l['area'] ?? '') !== $filtros['area']) return false;
    if ($filtros['desde'] !== '' && $dia < $filtros['desde']) return false;
    if ($filtros['hasta'] !== '' && $dia > $filtros['hasta']) return false;
    if ($filtros['q'] !== '') {
        $pajar = mb_strtolower(implode(' ', [$l['nombre'] ?? '', $l['email'] ?? '', $l['whatsapp'] ?? '']));
        if (!str_contains($pajar, mb_strtolower($filtros['q']))) return false;
    }
    return true;
}));

// ── Exportar CSV (solo con sesión) ─────────────────────────────────────────
if ($autenticado && isset($_GET['exportar'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="leads-' . date('Ymd-Hi') . '.csv"');
    $salida = fopen('php://output', 'w');
    fwrite($salida, "\xEF\xBB\xBF"); // BOM: Excel abre las tildes bien
    $columnas = ['fecha', 'nombre', 'email', 'whatsapp', 'area', 'objetivo', 'inicio', 'consiente', 'marketing',
                 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'area_codigo', 'envio_id', 'pagina'];
    fputcsv($salida, $columnas);
    foreach ($filtrados as $l) {
        fputcsv($salida, array_map(static fn ($c) => celdaCsv($l[$c] ?? ''), $columnas));
    }
    fclose($salida);
    exit;
}

header('Content-Type: text/html; charset=utf-8');

$soloDigitos = static fn (string $t): string => preg_replace('/\D+/', '', $t) ?? '';
$origenCorto = static function (array $lead): string {
    $p   = parse_url($lead['pagina'] ?? '');
    $utm = utmDe($lead, $lead['pagina'] ?? '');
    $partes = array_filter([$utm['utm_source'], $utm['utm_campaign'], $utm['utm_content']]);
    return $partes ? implode(' · ', $partes) : ($p['host'] ?? '—');
};
?>
<!doctype html>
<html lang="es-PE">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Leads — Panel CAPSUR</title>
  <link rel="preload" href="/fonts/montserrat.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/fonts/montserrat.css" />
  <link rel="stylesheet" href="panel.css" />
</head>
<body>
<?php if (!$autenticado): ?>
  <main class="acceso">
    <form method="post" action="<?= $e($rutaBase) ?>" autocomplete="off">
      <h1>Panel CAPSUR</h1>
      <p>Leads y métricas de la landing · acceso restringido</p>
      <?php if ($aviso): ?><div class="aviso" role="alert"><?= $e($aviso) ?></div><?php endif; ?>
      <input type="hidden" name="accion" value="entrar" />
      <label for="usuario">Usuario</label>
      <input id="usuario" name="usuario" type="text" required autocomplete="username" autofocus />
      <label for="clave">Contraseña</label>
      <input id="clave" name="clave" type="password" required autocomplete="current-password" />
      <button class="btn" type="submit">Entrar</button>
    </form>
  </main>
<?php else: ?>
  <header class="barra">
    <div>
      <strong>CAPSUR · Panel</strong>
      <nav class="pestanas" aria-label="Secciones del panel">
        <a class="on" href="index.php" aria-current="page">Leads</a>
        <a href="posibles.php">Posibles</a>
        <a href="metricas.php">Métricas</a>
      </nav>
    </div>
    <div class="derecha">
      <span class="usuario"><?= $e($usuarioAdmin) ?></span>
      <form method="post" action="<?= $e($rutaBase) ?>">
        <input type="hidden" name="accion" value="salir" />
        <input type="hidden" name="csrf" value="<?= $e($_SESSION['csrf'] ?? '') ?>" />
        <button type="submit">Salir</button>
      </form>
    </div>
  </header>

  <main class="contenido">
    <?php if ($aviso): ?><div class="aviso" role="alert"><?= $e($aviso) ?></div><?php endif; ?>

    <section class="tarjetas" aria-label="Resumen">
      <div class="tarjeta destacada"><div class="n"><?= $totales['total'] ?></div><div class="t">Leads en total</div></div>
      <div class="tarjeta"><div class="n"><?= $totales['hoy'] ?></div><div class="t">Hoy</div></div>
      <div class="tarjeta"><div class="n"><?= $totales['semana'] ?></div><div class="t">Últimos 7 días</div></div>
      <?php $top = array_key_first($totales['porArea']); ?>
      <div class="tarjeta"><div class="n" style="font-size:16px;padding-top:6px"><?= $e($top ?? '—') ?></div><div class="t">Área más pedida<?= $top ? ' · ' . $totales['porArea'][$top] : '' ?></div></div>
    </section>

    <form class="filtros" method="get" action="<?= $e($rutaBase) ?>">
      <div><label for="q">Buscar</label><input id="q" name="q" type="search" value="<?= $e($filtros['q']) ?>" placeholder="Nombre, correo o WhatsApp" /></div>
      <div><label for="area">Área</label>
        <select id="area" name="area"><option value="">Todas</option>
          <?php foreach ($areas as $a): ?><option value="<?= $e($a) ?>"<?= $a === $filtros['area'] ? ' selected' : '' ?>><?= $e($a) ?></option><?php endforeach; ?>
        </select></div>
      <div><label for="desde">Desde</label><input id="desde" name="desde" type="date" value="<?= $e($filtros['desde']) ?>" /></div>
      <div><label for="hasta">Hasta</label><input id="hasta" name="hasta" type="date" value="<?= $e($filtros['hasta']) ?>" /></div>
      <div class="acciones">
        <button class="btn" type="submit">Filtrar</button>
        <a class="btn sec" href="<?= $e($rutaBase) ?>">Limpiar</a>
        <a class="btn sec" href="<?= $e($rutaBase . '?' . http_build_query(array_filter($filtros) + ['exportar' => 1])) ?>">Exportar CSV</a>
      </div>
    </form>

    <p class="resumen">
      <?= count($filtrados) ?> de <?= count($leads) ?> leads<?= count($filtrados) > FILAS_MAX ? ' · se muestran los ' . FILAS_MAX . ' más recientes; usa los filtros o exporta para ver el resto' : '' ?>.
    </p>

    <div class="tabla">
      <?php if (!$leads): ?>
        <div class="vacio">Todavía no hay leads. Cuando llegue el primero aparecerá aquí.</div>
      <?php elseif (!$filtrados): ?>
        <div class="vacio">Ningún lead coincide con esos filtros.</div>
      <?php else: ?>
      <table class="ancha">
        <thead><tr><th>Fecha</th><th>Nombre</th><th>Contacto</th><th>Área</th><th>Qué busca</th><th>Cuándo</th><th>Marketing</th><th>Origen</th></tr></thead>
        <tbody>
        <?php foreach (array_slice($filtrados, 0, FILAS_MAX) as $l): ?>
          <?php $wa = $soloDigitos($l['whatsapp'] ?? ''); ?>
          <tr>
            <td><?= $e(substr($l['fecha'] ?? '', 0, 10)) ?><div class="peq"><?= $e(substr($l['fecha'] ?? '', 11, 5)) ?></div></td>
            <td><strong><?= $e($l['nombre'] ?? '') ?></strong></td>
            <td>
              <a href="mailto:<?= $e($l['email'] ?? '') ?>"><?= $e($l['email'] ?? '') ?></a>
              <?php if ($wa !== ''): ?><div class="peq"><a href="https://wa.me/<?= $e($wa) ?>" target="_blank" rel="noopener noreferrer"><?= $e($l['whatsapp']) ?></a></div><?php endif; ?>
            </td>
            <td><span class="etiqueta"><?= $e($l['area'] ?? '') ?></span></td>
            <td><?= $e($l['objetivo'] ?? '') ?></td>
            <td><?= $e($l['inicio'] ?? '') ?></td>
            <td><?= ($l['marketing'] ?? '') === 'si' ? '<span class="si">Sí</span>' : '<span class="no">No</span>' ?></td>
            <td class="peq" title="<?= $e($l['pagina'] ?? '') ?>"><?= $e($origenCorto($l)) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>
  </main>
<?php endif; ?>
</body>
</html>
