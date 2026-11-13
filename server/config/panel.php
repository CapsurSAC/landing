<?php
/**
 * Lo común a todas las páginas del panel (admin/*.php): cabeceras, acceso por
 * IP, sesión, menú, registro de auditoría y la confirmación de contraseña
 * antes de sacar datos personales. Vive en config/, fuera de la web.
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap-min.php';

/** Páginas del panel, en el orden del menú. */
const PANEL_PAGINAS = [
    'index.php'    => 'Leads',
    'posibles.php' => 'Posibles',
    'metricas.php' => 'Métricas',
    'reclamos.php' => 'Reclamaciones',
    'datos.php'    => 'Datos personales',
];

/** Minutos que vale la contraseña confirmada para exportar o borrar. */
const REAUTENTICACION_SEGUNDOS = 300;

/** Escapa texto para HTML. */
function h(mixed $texto): string
{
    return htmlspecialchars((string) $texto, ENT_QUOTES, 'UTF-8');
}

/**
 * Cabeceras de todas las páginas del panel. Sin scripts, marcos ni recursos
 * de terceros: si algún dato de un visitante llegara a pintarse sin escapar,
 * no podría ejecutar nada.
 */
function cabecerasPanel(): void
{
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}

/**
 * Con PANEL_IPS (IPs o rangos CIDR separados por coma) el panel solo existe
 * para esas direcciones: al resto se le responde 404.
 */
function exigirIpDelPanel(): void
{
    $rangos = array_filter(array_map('trim', explode(',', env('PANEL_IPS'))));
    if ($rangos && !ipEnRangos(ipVisitante(), $rangos)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        exit('Not Found');
    }
}

/** Arranque de una página del panel que exige haber entrado. */
function paginaDelPanel(): void
{
    exigirIpDelPanel();
    cabecerasPanel();
    sesionPanel();
    if (empty($_SESSION['admin'])) {
        header('Location: index.php', true, 303);
        exit;
    }
}

/** Token CSRF de la sesión, para los formularios que cambian algo. */
function csrf(): string
{
    return $_SESSION['csrf'] ?? '';
}

function csrfValido(): bool
{
    return csrf() !== '' && hash_equals(csrf(), texto($_POST['csrf'] ?? ''));
}

/**
 * Registro de auditoría: quién entró, falló, salió, exportó o borró, y desde
 * dónde. Una línea JSON por evento en storage/auditoria.log.
 */
function auditar(string $accion, string $detalle = ''): void
{
    $linea = json_encode([
        'fecha'   => (new DateTimeImmutable('now', new DateTimeZone('America/Lima')))->format('Y-m-d H:i:s'),
        'usuario' => !empty($_SESSION['admin']) ? env('ADMIN_USUARIO') : '',
        'ip'      => ipVisitante(),
        'accion'  => $accion,
        'detalle' => $detalle,
    ], JSON_UNESCAPED_UNICODE);
    @file_put_contents(__DIR__ . '/../storage/auditoria.log', $linea . "\n", FILE_APPEND | LOCK_EX);
}

/** Últimos eventos de auditoría, más recientes primero. */
function ultimosEventosAuditoria(int $cuantos = 50): array
{
    $ruta = __DIR__ . '/../storage/auditoria.log';
    if (!is_readable($ruta)) {
        return [];
    }
    $lineas = array_slice(file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [], -$cuantos);
    $eventos = array_filter(array_map(static fn ($l) => json_decode($l, true), $lineas), 'is_array');
    return array_reverse(array_values($eventos));
}

/**
 * Antes de exportar o borrar datos personales se vuelve a pedir la
 * contraseña (vale 5 minutos). Si no está confirmada, pinta el formulario y
 * corta la página; si llega el formulario, lo comprueba y redirige a $destino.
 */
function exigirReautenticacion(string $destino, string $motivo): void
{
    if (time() - (int) ($_SESSION['reautenticado'] ?? 0) < REAUTENTICACION_SEGUNDOS) {
        return;
    }
    // Solo destinos del propio panel: nada de redirigir a otro sitio.
    if (!preg_match('/^(index|posibles|metricas|datos)\.php(\?[A-Za-z0-9_=&%.\-+@]*)?$/', $destino)) {
        $destino = 'index.php';
    }
    $aviso = '';
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && texto($_POST['accion'] ?? '') === 'reautenticar') {
        $claveLimite = 'panel-login:' . ipParaLimite(ipVisitante());
        if (!csrfValido()) {
            $aviso = 'La página caducó. Vuelve a intentarlo.';
        } elseif (!registrarSiCabe($claveLimite, 900, 5)) {
            $aviso = 'Demasiados intentos. Espera 15 minutos.';
        } elseif (password_verify(texto($_POST['clave'] ?? ''), env('ADMIN_HASH'))) {
            $_SESSION['reautenticado'] = time();
            auditar('reautenticar', $motivo);
            header('Location: ' . $destino, true, 303);
            exit;
        } else {
            auditar('reautenticar-fallo', $motivo);
            usleep(400000);
            $aviso = 'Contraseña incorrecta.';
        }
    }
    header('Content-Type: text/html; charset=utf-8');
    ?>
<!doctype html>
<html lang="es-PE">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Confirma tu contraseña — Panel CAPSUR</title>
  <link rel="stylesheet" href="/fonts/montserrat.css" />
  <link rel="stylesheet" href="panel.css" />
</head>
<body>
  <main class="acceso">
    <form method="post" action="<?= h($destino) ?>" autocomplete="off">
      <h1>Confirma tu contraseña</h1>
      <p>Vas a <?= h($motivo) ?>. Son datos personales: por seguridad, vuelve a escribir tu contraseña.</p>
      <?php if ($aviso): ?><div class="aviso" role="alert"><?= h($aviso) ?></div><?php endif; ?>
      <input type="hidden" name="accion" value="reautenticar" />
      <input type="hidden" name="csrf" value="<?= h(csrf()) ?>" />
      <label for="clave">Contraseña</label>
      <input id="clave" name="clave" type="password" required autocomplete="current-password" autofocus />
      <button class="btn" type="submit">Continuar</button>
      <p><a href="index.php">Cancelar</a></p>
    </form>
  </main>
</body>
</html>
    <?php
    exit;
}

/** Barra superior con el menú; $actual es el archivo de la página. */
function barraDelPanel(string $actual): string
{
    $enlaces = '';
    foreach (PANEL_PAGINAS as $archivo => $nombre) {
        $enlaces .= $archivo === $actual
            ? '<a class="on" href="' . h($archivo) . '" aria-current="page">' . h($nombre) . '</a>'
            : '<a href="' . h($archivo) . '">' . h($nombre) . '</a>';
    }
    return '<header class="barra"><div><strong>CAPSUR · Panel</strong>'
        . '<nav class="pestanas" aria-label="Secciones del panel">' . $enlaces . '</nav></div>'
        . '<div class="derecha"><span class="usuario">' . h(env('ADMIN_USUARIO')) . '</span>'
        . '<form method="post" action="index.php"><input type="hidden" name="accion" value="salir" />'
        . '<input type="hidden" name="csrf" value="' . h(csrf()) . '" /><button type="submit">Salir</button></form>'
        . '</div></header>';
}

/** <head> común; $titulo es el nombre de la página. */
function cabezaHtml(string $titulo): string
{
    return '<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />'
        . '<meta name="robots" content="noindex, nofollow" /><title>' . h($titulo) . ' — Panel CAPSUR</title>'
        . '<link rel="preload" href="/fonts/montserrat.woff2" as="font" type="font/woff2" crossorigin />'
        . '<link rel="stylesheet" href="/fonts/montserrat.css" /><link rel="stylesheet" href="panel.css" />';
}

/* ── Segundo factor (TOTP, RFC 6238) ───────────────────────────────────── */

/** Decodifica base32 (RFC 4648) como lo muestran las apps de autenticación. */
function base32Decodificar(string $texto): string
{
    $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $texto    = strtoupper((string) preg_replace('/[^A-Za-z2-7]/', '', $texto));
    $bits     = '';
    foreach (str_split($texto) as $c) {
        $bits .= str_pad(decbin((int) strpos($alfabeto, $c)), 5, '0', STR_PAD_LEFT);
    }
    $salida = '';
    foreach (str_split($bits, 8) as $byte) {
        if (strlen($byte) === 8) {
            $salida .= chr((int) bindec($byte));
        }
    }
    return $salida;
}

/** Código de 6 dígitos para el intervalo de 30 s número $paso. */
function codigoTotp(string $secreto, int $paso): string
{
    $hmac   = hash_hmac('sha1', pack('J', $paso), base32Decodificar($secreto), true);
    $offset = ord($hmac[19]) & 0x0f;
    $numero = (unpack('N', substr($hmac, $offset, 4))[1] & 0x7fffffff) % 1_000_000;
    return str_pad((string) $numero, 6, '0', STR_PAD_LEFT);
}

/**
 * Comprueba el código del segundo factor con un margen de ±30 s, y no deja
 * usar dos veces el mismo intervalo (quien lo vea por encima del hombro no
 * puede repetirlo).
 */
function totpValido(string $secreto, string $codigo): bool
{
    $codigo = (string) preg_replace('/\D/', '', $codigo);
    if (strlen($codigo) !== 6) {
        return false;
    }
    $usado = __DIR__ . '/../storage/rate/totp-ultimo-paso';
    $ultimo = (int) @file_get_contents($usado);
    $ahora = intdiv(time(), 30);
    foreach ([$ahora - 1, $ahora, $ahora + 1] as $paso) {
        if ($paso > $ultimo && hash_equals(codigoTotp($secreto, $paso), $codigo)) {
            @file_put_contents($usado, (string) $paso, LOCK_EX);
            return true;
        }
    }
    return false;
}
