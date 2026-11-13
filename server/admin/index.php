<?php
/**
 * Panel de leads de la landing CAPSUR.
 *
 * Sube la carpeta server/admin/ a public_html/admin/. Lee storage/leads.csv
 * (fuera de public_html) y exige las credenciales definidas en config/.env:
 *
 *   ADMIN_USUARIO=correo@dominio.com
 *   ADMIN_HASH=$argon2id$...      ← php config/generar-hash.php "contraseña"
 *   ADMIN_TOTP=JBSWY3DP...         ← opcional: php config/generar-totp.php
 *
 * Protecciones: contraseña solo como hash, segundo factor opcional (código de
 * una app de autenticación), 5 intentos fallidos por IP cada 15 minutos (la IP
 * real, no la que diga una cabecera), sesión HttpOnly + Secure + SameSite=Strict
 * que caduca a las 2 horas o a los 30 minutos sin uso, identificador renovado,
 * token CSRF en todo lo que cambia algo, contraseña otra vez antes de exportar,
 * registro de auditoría, acceso opcional solo desde ciertas IPs (PANEL_IPS) y
 * una política de contenido que no deja ejecutar scripts.
 */
declare(strict_types=1);

// La configuración vive FUERA de public_html en cPanel (dos niveles arriba) y
// en server/config dentro del repositorio (un nivel arriba).
$carpetaConfig = is_file(__DIR__ . '/../../config/panel.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/panel.php';

$archivoLeads   = $carpetaConfig . '/../storage/leads.csv';
$archivoEstados = $carpetaConfig . '/../storage/estados.json';

exigirIpDelPanel();
cabecerasPanel();

$usuarioAdmin = env('ADMIN_USUARIO');
$hashAdmin    = env('ADMIN_HASH');
$totpAdmin    = env('ADMIN_TOTP');
$configurado  = $usuarioAdmin !== '' && $hashAdmin !== '';

const INTENTOS_MAX     = 5;
const INTENTOS_VENTANA = 900; // 15 minutos
const FILAS_MAX        = 300;

/** Seguimiento comercial de cada lead. */
const ESTADOS = [
    'nuevo'       => 'Nuevo',
    'contactado'  => 'Contactado',
    'interesado'  => 'Interesado',
    'matriculado' => 'Matriculado',
    'descartado'  => 'Descartado',
];

// ── Sesión (compartida con las demás páginas del panel y api/metricas.php) ─
sesionPanel();

// La ruta de esta página, para los action y las redirecciones. Viene de la
// petición, así que solo se acepta una ruta local corriente: con "//otro.com"
// el formulario de acceso enviaría la contraseña a otro servidor.
$rutaBase = (string) preg_replace('#/{2,}#', '/', strtok((string) ($_SERVER['REQUEST_URI'] ?? ''), '?') ?: '');
if (!preg_match('#^/[A-Za-z0-9._~/-]*$#', $rutaBase)) {
    $rutaBase = '/admin/';
}
$ip    = ipVisitante();
$aviso = '';

if (!empty($_SESSION['caducada'])) {
    unset($_SESSION['caducada']);
    $aviso = 'La sesión caducó. Vuelve a entrar.';
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = $metodo === 'POST' ? texto($_POST['accion'] ?? '') : '';

// ── Salir ──────────────────────────────────────────────────────────────────
if ($accion === 'salir') {
    if (csrfValido()) {
        auditar('salir');
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
        // Se comprueban todos siempre, para que el tiempo de respuesta no delate cuál falló.
        $usuarioOk = hash_equals($usuarioAdmin, $usuario);
        $claveOk   = password_verify($clave, $hashAdmin);
        $codigoOk  = $totpAdmin === '' || totpValido($totpAdmin, texto($_POST['codigo'] ?? ''));

        if ($usuarioOk && $claveOk && $codigoOk) {
            @unlink(archivoLimite($claveLimite)); // entrar bien no gasta intentos
            session_regenerate_id(true);
            $_SESSION['admin']    = true;
            $_SESSION['inicio']   = time();
            $_SESSION['ultimo']   = time();
            $_SESSION['renovado'] = time();
            $_SESSION['csrf']     = bin2hex(random_bytes(16));
            auditar('entrar');
            header('Location: ' . $rutaBase, true, 303);
            exit;
        }
        auditar('entrar-fallo', mb_substr($usuario, 0, 80));
        usleep(400000);
        $aviso = $totpAdmin !== ''
            ? 'Usuario, contraseña o código incorrectos.'
            : 'Usuario o contraseña incorrectos.';
    }
}

$autenticado = !empty($_SESSION['admin']);

// ── Estados y notas ────────────────────────────────────────────────────────

function leerEstados(string $archivo): array
{
    $datos = json_decode((string) @file_get_contents($archivo), true);
    return is_array($datos) ? $datos : [];
}

if ($autenticado && $accion === 'estado') {
    $envio  = strtolower(limpiar($_POST['envio_id'] ?? '', 36));
    $estado = texto($_POST['estado'] ?? '');
    if (csrfValido() && preg_match('/^[0-9a-f-]{36}$/', $envio) && isset(ESTADOS[$estado])) {
        // Leer, cambiar y escribir bajo el mismo bloqueo: dos asesores a la vez no se pisan.
        $f = @fopen($archivoEstados, 'c+');
        if ($f) {
            flock($f, LOCK_EX);
            $todos = json_decode((string) stream_get_contents($f), true);
            $todos = is_array($todos) ? $todos : [];
            $todos[$envio] = [
                'estado' => $estado,
                'nota'   => limpiar($_POST['nota'] ?? '', 300),
                'fecha'  => (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d H:i'),
            ];
            rewind($f);
            ftruncate($f, 0);
            fwrite($f, (string) json_encode($todos, JSON_UNESCAPED_UNICODE));
            fflush($f);
            flock($f, LOCK_UN);
            fclose($f);
            auditar('estado', $envio . ' → ' . $estado);
        }
    }
    $volver = texto($_POST['volver'] ?? '');
    header('Location: ' . (preg_match('/^\?[A-Za-z0-9_=&%.\-+]*$/', $volver) ? $rutaBase . $volver : $rutaBase), true, 303);
    exit;
}

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
            // Un archivo creado antes de sumar columnas tiene la cabecera vieja
            // y, después, filas con las columnas nuevas.
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
    'q'      => trim(texto($_GET['q'] ?? '')),
    'area'   => trim(texto($_GET['area'] ?? '')),
    'estado' => isset(ESTADOS[$_GET['estado'] ?? '']) ? (string) $_GET['estado'] : '',
    'desde'  => preg_match('/^\d{4}-\d{2}-\d{2}$/', texto($_GET['desde'] ?? '')) ? $_GET['desde'] : '',
    'hasta'  => preg_match('/^\d{4}-\d{2}-\d{2}$/', texto($_GET['hasta'] ?? '')) ? $_GET['hasta'] : '',
];
$pagina = max(1, (int) ($_GET['pagina'] ?? 1));

$leads   = $autenticado ? leerLeads($archivoLeads) : [];
$estados = $autenticado ? leerEstados($archivoEstados) : [];
$estadoDe = static fn (array $l): string => $estados[$l['envio_id'] ?? '']['estado'] ?? 'nuevo';

$areas = array_values(array_unique(array_filter(array_column($leads, 'area'))));
sort($areas, SORT_LOCALE_STRING);

$hoy     = (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d');
$hace7   = (new DateTimeImmutable('-6 days', new DateTimeZone('America/Lima')))->format('Y-m-d');
$totales = ['total' => count($leads), 'hoy' => 0, 'semana' => 0, 'porArea' => [], 'sinAtender' => 0];
foreach ($leads as $l) {
    $dia = substr($l['fecha'] ?? '', 0, 10);
    if ($dia === $hoy)   $totales['hoy']++;
    if ($dia >= $hace7)  $totales['semana']++;
    if ($estadoDe($l) === 'nuevo') $totales['sinAtender']++;
    $a = $l['area'] ?: 'Sin área';
    $totales['porArea'][$a] = ($totales['porArea'][$a] ?? 0) + 1;
}
arsort($totales['porArea']);

$filtrados = array_values(array_filter($leads, static function (array $l) use ($filtros, $estadoDe): bool {
    $dia = substr($l['fecha'] ?? '', 0, 10);
    if ($filtros['area'] !== '' && ($l['area'] ?? '') !== $filtros['area']) return false;
    if ($filtros['estado'] !== '' && $estadoDe($l) !== $filtros['estado']) return false;
    if ($filtros['desde'] !== '' && $dia < $filtros['desde']) return false;
    if ($filtros['hasta'] !== '' && $dia > $filtros['hasta']) return false;
    if ($filtros['q'] !== '') {
        $pajar = mb_strtolower(implode(' ', [$l['nombre'] ?? '', $l['email'] ?? '', $l['whatsapp'] ?? '']));
        if (!str_contains($pajar, mb_strtolower($filtros['q']))) return false;
    }
    return true;
}));

$paginas = max(1, (int) ceil(count($filtrados) / FILAS_MAX));
$pagina  = min($pagina, $paginas);
$visibles = array_slice($filtrados, ($pagina - 1) * FILAS_MAX, FILAS_MAX);
$consulta = static fn (array $extra = []): string => '?' . http_build_query(array_filter($filtros) + $extra);

// ── Exportar CSV (solo con sesión y la contraseña recién confirmada) ───────
if ($autenticado && isset($_GET['exportar'])) {
    exigirReautenticacion('index.php' . $consulta(['exportar' => 1]), 'exportar los leads');
    auditar('exportar-leads', count($filtrados) . ' filas');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="leads-' . date('Ymd-Hi') . '.csv"');
    $salida = fopen('php://output', 'w');
    fwrite($salida, "\xEF\xBB\xBF"); // BOM: Excel abre las tildes bien
    $columnas = ['fecha', 'nombre', 'email', 'whatsapp', 'area', 'programa', 'objetivo', 'inicio', 'consiente', 'marketing',
                 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'area_codigo', 'envio_id', 'pagina'];
    fputcsv($salida, [...$columnas, 'estado', 'nota']);
    foreach ($filtrados as $l) {
        $seguimiento = $estados[$l['envio_id'] ?? ''] ?? [];
        fputcsv($salida, array_map(static fn ($c) => celdaCsv($c), [
            ...array_map(static fn ($c) => $l[$c] ?? '', $columnas),
            ESTADOS[$estadoDe($l)], $seguimiento['nota'] ?? '',
        ]));
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
  <?= cabezaHtml('Leads') ?>
</head>
<body>
<?php if (!$autenticado): ?>
  <main class="acceso">
    <form method="post" action="<?= h($rutaBase) ?>" autocomplete="off">
      <h1>Panel CAPSUR</h1>
      <p>Leads y métricas de la landing · acceso restringido</p>
      <?php if ($aviso): ?><div class="aviso" role="alert"><?= h($aviso) ?></div><?php endif; ?>
      <input type="hidden" name="accion" value="entrar" />
      <label for="usuario">Usuario</label>
      <input id="usuario" name="usuario" type="text" required autocomplete="username" autofocus />
      <label for="clave">Contraseña</label>
      <input id="clave" name="clave" type="password" required autocomplete="current-password" />
      <?php if ($totpAdmin !== ''): ?>
        <label for="codigo">Código de tu app de autenticación</label>
        <input id="codigo" name="codigo" type="text" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code" />
      <?php endif; ?>
      <button class="btn" type="submit">Entrar</button>
    </form>
  </main>
<?php else: ?>
  <?= barraDelPanel('index.php') ?>

  <main class="contenido">
    <?php if ($aviso): ?><div class="aviso" role="alert"><?= h($aviso) ?></div><?php endif; ?>

    <section class="tarjetas" aria-label="Resumen">
      <div class="tarjeta destacada"><div class="n"><?= $totales['total'] ?></div><div class="t">Leads en total</div></div>
      <div class="tarjeta"><div class="n"><?= $totales['sinAtender'] ?></div><div class="t">Sin atender (estado Nuevo)</div></div>
      <div class="tarjeta"><div class="n"><?= $totales['hoy'] ?></div><div class="t">Hoy</div></div>
      <div class="tarjeta"><div class="n"><?= $totales['semana'] ?></div><div class="t">Últimos 7 días</div></div>
      <?php $top = array_key_first($totales['porArea']); ?>
      <div class="tarjeta"><div class="n" style="font-size:16px;padding-top:6px"><?= h($top ?? '—') ?></div><div class="t">Área más pedida<?= $top ? ' · ' . $totales['porArea'][$top] : '' ?></div></div>
    </section>

    <form class="filtros" method="get" action="<?= h($rutaBase) ?>">
      <div><label for="q">Buscar</label><input id="q" name="q" type="search" value="<?= h($filtros['q']) ?>" placeholder="Nombre, correo o WhatsApp" /></div>
      <div><label for="area">Área</label>
        <select id="area" name="area"><option value="">Todas</option>
          <?php foreach ($areas as $a): ?><option value="<?= h($a) ?>"<?= $a === $filtros['area'] ? ' selected' : '' ?>><?= h($a) ?></option><?php endforeach; ?>
        </select></div>
      <div><label for="estado">Estado</label>
        <select id="estado" name="estado"><option value="">Todos</option>
          <?php foreach (ESTADOS as $clave => $nombre): ?><option value="<?= h($clave) ?>"<?= $clave === $filtros['estado'] ? ' selected' : '' ?>><?= h($nombre) ?></option><?php endforeach; ?>
        </select></div>
      <div><label for="desde">Desde</label><input id="desde" name="desde" type="date" value="<?= h($filtros['desde']) ?>" /></div>
      <div><label for="hasta">Hasta</label><input id="hasta" name="hasta" type="date" value="<?= h($filtros['hasta']) ?>" /></div>
      <div class="acciones">
        <button class="btn" type="submit">Filtrar</button>
        <a class="btn sec" href="<?= h($rutaBase) ?>">Limpiar</a>
        <a class="btn sec" href="<?= h($rutaBase . $consulta(['exportar' => 1])) ?>">Exportar CSV</a>
      </div>
    </form>

    <p class="resumen">
      <?= count($filtrados) ?> de <?= count($leads) ?> leads<?= $paginas > 1 ? " · página {$pagina} de {$paginas}" : '' ?>.
    </p>

    <div class="tabla">
      <?php if (!$leads): ?>
        <div class="vacio">Todavía no hay leads. Cuando llegue el primero aparecerá aquí.</div>
      <?php elseif (!$filtrados): ?>
        <div class="vacio">Ningún lead coincide con esos filtros.</div>
      <?php else: ?>
      <table class="ancha">
        <thead><tr><th>Fecha</th><th>Nombre</th><th>Contacto</th><th>Área</th><th>Qué busca</th><th>Cuándo</th><th>Marketing</th><th>Origen</th><th>Seguimiento</th></tr></thead>
        <tbody>
        <?php foreach ($visibles as $l): ?>
          <?php $wa = $soloDigitos($l['whatsapp'] ?? ''); $envio = $l['envio_id'] ?? ''; $seguimiento = $estados[$envio] ?? []; ?>
          <tr>
            <td><?= h(substr($l['fecha'] ?? '', 0, 10)) ?><div class="peq"><?= h(substr($l['fecha'] ?? '', 11, 5)) ?></div></td>
            <td><strong><?= h($l['nombre'] ?? '') ?></strong></td>
            <td>
              <a href="mailto:<?= h($l['email'] ?? '') ?>"><?= h($l['email'] ?? '') ?></a>
              <?php if ($wa !== ''): ?><div class="peq"><a href="https://wa.me/<?= h(strlen($wa) === 9 ? '51' . $wa : $wa) ?>" target="_blank" rel="noopener noreferrer"><?= h($l['whatsapp']) ?></a></div><?php endif; ?>
            </td>
            <td><span class="etiqueta"><?= h($l['area'] ?? '') ?></span><?php if (!empty($l['programa'])): ?><div class="peq">Vio: <?= h($l['programa']) ?></div><?php endif; ?></td>
            <td><?= h($l['objetivo'] ?? '') ?></td>
            <td><?= h($l['inicio'] ?? '') ?></td>
            <td><?= ($l['marketing'] ?? '') === 'si' ? '<span class="si">Sí</span>' : '<span class="no">No</span>' ?></td>
            <td class="peq" title="<?= h($l['pagina'] ?? '') ?>"><?= h($origenCorto($l)) ?></td>
            <td>
              <?php if (preg_match('/^[0-9a-f-]{36}$/', $envio)): ?>
              <form class="seguimiento" method="post" action="<?= h($rutaBase) ?>">
                <input type="hidden" name="accion" value="estado" />
                <input type="hidden" name="csrf" value="<?= h(csrf()) ?>" />
                <input type="hidden" name="envio_id" value="<?= h($envio) ?>" />
                <input type="hidden" name="volver" value="<?= h($consulta(['pagina' => $pagina])) ?>" />
                <select name="estado" aria-label="Estado de <?= h($l['nombre'] ?? '') ?>">
                  <?php foreach (ESTADOS as $clave => $nombre): ?><option value="<?= h($clave) ?>"<?= $clave === $estadoDe($l) ? ' selected' : '' ?>><?= h($nombre) ?></option><?php endforeach; ?>
                </select>
                <input name="nota" type="text" maxlength="300" value="<?= h($seguimiento['nota'] ?? '') ?>" placeholder="Nota" aria-label="Nota sobre <?= h($l['nombre'] ?? '') ?>" />
                <button type="submit">Guardar</button>
                <?php if (!empty($seguimiento['fecha'])): ?><div class="peq"><?= h($seguimiento['fecha']) ?></div><?php endif; ?>
              </form>
              <?php else: ?><span class="peq">—</span><?php endif; ?>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>

    <?php if ($paginas > 1): ?>
      <nav class="paginas" aria-label="Páginas">
        <?php if ($pagina > 1): ?><a class="btn sec" href="<?= h($rutaBase . $consulta(['pagina' => $pagina - 1])) ?>">← Anteriores</a><?php endif; ?>
        <?php if ($pagina < $paginas): ?><a class="btn sec" href="<?= h($rutaBase . $consulta(['pagina' => $pagina + 1])) ?>">Siguientes →</a><?php endif; ?>
      </nav>
    <?php endif; ?>
  </main>
<?php endif; ?>
</body>
</html>
