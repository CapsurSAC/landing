<?php
/**
 * Datos personales: atender los derechos ARCO (Ley 29733).
 *
 * Busca a una persona por su correo o su celular en todo lo que guarda la
 * landing (leads, posibles y visitas), y permite descargar lo que hay de ella
 * o borrarlo. Descargar y borrar piden otra vez la contraseña y quedan en el
 * registro de auditoría, que también se ve aquí.
 *
 * No alcanza a Chatwoot ni a los correos ya enviados: eso se borra allí.
 */
declare(strict_types=1);

$carpetaConfig = is_file(__DIR__ . '/../../config/panel.php')
    ? __DIR__ . '/../../config'
    : __DIR__ . '/../config';
require $carpetaConfig . '/panel.php';

paginaDelPanel();

$almacen = $carpetaConfig . '/../storage';
$archivoLeads = $almacen . '/leads.csv';

$q = trim(texto($_GET['q'] ?? $_POST['q'] ?? ''));
$correoBuscado = filter_var(mb_strtolower($q), FILTER_VALIDATE_EMAIL) ?: '';
$digitos = (string) preg_replace('/\D/', '', $q);
$celularBuscado = strlen($digitos) >= 9 ? substr($digitos, -9) : '';

/** ¿Este correo o celular es el que se busca? */
$coincide = static function (string $correo, string $celular) use ($correoBuscado, $celularBuscado): bool {
    if ($correoBuscado !== '' && mb_strtolower(trim($correo)) === $correoBuscado) {
        return true;
    }
    $d = (string) preg_replace('/\D/', '', $celular);
    return $celularBuscado !== '' && strlen($d) >= 9 && substr($d, -9) === $celularBuscado;
};

/** Filas del CSV de leads como arreglos con nombre de columna. */
function filasDeLeads(string $contenido): array
{
    $lineas = [];
    $f = fopen('php://memory', 'r+');
    fwrite($f, $contenido);
    rewind($f);
    $cabecera = fgetcsv($f);
    while (is_array($cabecera) && ($fila = fgetcsv($f)) !== false) {
        $columnas = match (count($fila)) {
            count($cabecera)      => $cabecera,
            count(COLUMNAS_LEADS) => COLUMNAS_LEADS,
            default               => null,
        };
        $lineas[] = ['crudo' => $fila, 'datos' => $columnas ? array_combine($columnas, $fila) : []];
    }
    fclose($f);
    return ['cabecera' => $cabecera ?: COLUMNAS_LEADS, 'filas' => $lineas];
}

/** Todo lo que hay de la persona buscada. */
function buscarPersona(string $almacen, string $archivoLeads, callable $coincide): array
{
    $hallado = ['leads' => [], 'posibles' => [], 'visitas' => []];
    if (is_readable($archivoLeads)) {
        foreach (filasDeLeads((string) file_get_contents($archivoLeads))['filas'] as $f) {
            if ($f['datos'] && $coincide($f['datos']['email'] ?? '', $f['datos']['whatsapp'] ?? '')) {
                $hallado['leads'][] = $f['datos'];
            }
        }
    }
    foreach (['posibles' => ['email', 'whatsapp'], 'visitas' => ['correo', 'whatsapp']] as $carpeta => [$campoCorreo, $campoCelular]) {
        foreach (glob($almacen . '/' . $carpeta . '/*.json') ?: [] as $ruta) {
            $d = json_decode((string) @file_get_contents($ruta), true);
            if (is_array($d) && $coincide((string) ($d[$campoCorreo] ?? ''), (string) ($d[$campoCelular] ?? ''))) {
                $hallado[$carpeta][basename($ruta)] = $d;
            }
        }
    }
    return $hallado;
}

$buscando = $correoBuscado !== '' || $celularBuscado !== '';
// En la auditoría no queda el dato completo: después de borrar a alguien, ahí tampoco debe estar.
$enmascarado = $correoBuscado !== ''
    ? mb_substr($correoBuscado, 0, 1) . '***@' . substr(strrchr($correoBuscado, '@') ?: '@', 1)
    : '***' . substr($celularBuscado, -3);
$hallado  = $buscando ? buscarPersona($almacen, $archivoLeads, $coincide) : ['leads' => [], 'posibles' => [], 'visitas' => []];
$total    = count($hallado['leads']) + count($hallado['posibles']) + count($hallado['visitas']);
$aqui     = 'datos.php?' . http_build_query(['q' => $q]);
$aviso    = '';

// ── Descargar todo lo de la persona (derecho de acceso) ────────────────────
if ($buscando && isset($_GET['descargar'])) {
    exigirReautenticacion($aqui . '&descargar=1', 'descargar los datos de una persona');
    auditar('arco-descargar', $enmascarado . ' · ' . $total . ' registros');
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="datos-personales-' . date('Ymd-Hi') . '.json"');
    echo json_encode($hallado + ['buscado' => $q, 'generado' => date('c')], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Para borrar, primero se confirma la contraseña (vuelve aquí con ella confirmada).
if ($buscando && isset($_GET['confirmar'])) {
    exigirReautenticacion($aqui, 'borrar los datos de una persona');
    header('Location: ' . $aqui, true, 303);
    exit;
}
$confirmada = time() - (int) ($_SESSION['reautenticado'] ?? 0) < REAUTENTICACION_SEGUNDOS;

// ── Borrar todo lo de la persona (derecho de cancelación) ──────────────────
if ($buscando && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && texto($_POST['accion'] ?? '') === 'borrar') {
    if (!csrfValido() || !$confirmada || empty($_POST['seguro'])) {
        $aviso = 'No se borró nada: confirma tu contraseña y marca la casilla.';
    } else {
        $borrados = ['leads' => 0, 'posibles' => 0, 'visitas' => 0];

        // Leads: se reescribe el CSV sin sus filas, bajo el mismo bloqueo que usa
        // api/enviar.php para añadir, así un envío que llega justo no se pierde.
        if ($f = @fopen($archivoLeads, 'c+')) {
            flock($f, LOCK_EX);
            $leido = filasDeLeads((string) stream_get_contents($f));
            $quedan = array_filter($leido['filas'], static function ($fila) use ($coincide, &$borrados) {
                $es = $fila['datos'] && $coincide($fila['datos']['email'] ?? '', $fila['datos']['whatsapp'] ?? '');
                if ($es) {
                    $borrados['leads']++;
                }
                return !$es;
            });
            rewind($f);
            ftruncate($f, 0);
            fputcsv($f, $leido['cabecera']);
            foreach ($quedan as $fila) {
                fputcsv($f, $fila['crudo']);
            }
            fflush($f);
            flock($f, LOCK_UN);
            fclose($f);
        }

        foreach (array_keys($hallado['posibles']) as $archivo) {
            if (@unlink($almacen . '/posibles/' . $archivo)) {
                $borrados['posibles']++;
            }
        }

        // En las visitas se quitan solo los datos de contacto: lo demás es anónimo.
        foreach (array_keys($hallado['visitas']) as $archivo) {
            $ruta = $almacen . '/visitas/' . $archivo;
            $d = json_decode((string) @file_get_contents($ruta), true);
            if (is_array($d)) {
                unset($d['nombre'], $d['correo'], $d['whatsapp']);
                $d['consintio'] = false;
                $d['datos_borrados'] = date('Y-m-d H:i');
                @file_put_contents($ruta, (string) json_encode($d, JSON_UNESCAPED_UNICODE), LOCK_EX);
                $borrados['visitas']++;
            }
        }

        auditar('arco-borrar', $enmascarado . ' · ' . json_encode($borrados));
        $aviso = "Borrado: {$borrados['leads']} leads, {$borrados['posibles']} posibles y los datos de contacto de {$borrados['visitas']} visitas. "
            . 'Si la persona también escribió por WhatsApp, bórrala además en Chatwoot.';
        $hallado = buscarPersona($almacen, $archivoLeads, $coincide);
        $total   = count($hallado['leads']) + count($hallado['posibles']) + count($hallado['visitas']);
    }
}

header('Content-Type: text/html; charset=utf-8');
$eventos = ultimosEventosAuditoria(40);
?>
<!doctype html>
<html lang="es-PE">
<head>
  <?= cabezaHtml('Datos personales') ?>
</head>
<body>
  <?= barraDelPanel('datos.php') ?>

  <main class="contenido">
    <p class="resumen">
      Para atender un pedido de acceso o de borrado (derechos ARCO, Ley 29733): busca a la persona por su correo o su
      celular. Se revisan leads, posibles y visitas. Chatwoot y los correos ya enviados se gestionan aparte.
    </p>

    <?php if ($aviso): ?><div class="aviso" role="status"><?= h($aviso) ?></div><?php endif; ?>

    <form class="filtros" method="get" action="datos.php">
      <div><label for="q">Correo o celular</label><input id="q" name="q" type="search" value="<?= h($q) ?>" placeholder="ana@correo.com o 951234567" required /></div>
      <div class="acciones"><button class="btn" type="submit">Buscar</button></div>
    </form>

    <?php if ($q !== '' && !$buscando): ?>
      <div class="vacio">Escribe un correo completo o un celular de 9 dígitos.</div>
    <?php elseif ($buscando): ?>
      <section class="tarjetas" aria-label="Encontrado">
        <div class="tarjeta destacada"><div class="n"><?= count($hallado['leads']) ?></div><div class="t">Leads</div></div>
        <div class="tarjeta"><div class="n"><?= count($hallado['posibles']) ?></div><div class="t">Posibles</div></div>
        <div class="tarjeta"><div class="n"><?= count($hallado['visitas']) ?></div><div class="t">Visitas con sus datos</div></div>
      </section>

      <?php if ($total === 0): ?>
        <div class="vacio">No hay nada guardado con ese dato.</div>
      <?php else: ?>
        <div class="tabla">
          <table class="ancha">
            <thead><tr><th>Dónde</th><th>Fecha</th><th>Nombre</th><th>Correo</th><th>WhatsApp</th></tr></thead>
            <tbody>
            <?php foreach ($hallado['leads'] as $l): ?>
              <tr><td>Lead</td><td><?= h($l['fecha'] ?? '') ?></td><td><?= h($l['nombre'] ?? '') ?></td><td><?= h($l['email'] ?? '') ?></td><td><?= h($l['whatsapp'] ?? '') ?></td></tr>
            <?php endforeach; ?>
            <?php foreach ($hallado['posibles'] as $p): ?>
              <tr><td>Posible</td><td><?= h($p['actualizado'] ?? '') ?></td><td><?= h($p['nombre'] ?? '') ?></td><td><?= h($p['email'] ?? '') ?></td><td><?= h($p['whatsapp'] ?? '') ?></td></tr>
            <?php endforeach; ?>
            <?php foreach ($hallado['visitas'] as $v): ?>
              <tr><td>Visita</td><td><?= h($v['inicio'] ?? '') ?></td><td><?= h($v['nombre'] ?? '') ?></td><td><?= h($v['correo'] ?? '') ?></td><td><?= h($v['whatsapp'] ?? '') ?></td></tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>

        <div class="acciones entre">
          <a class="btn sec" href="<?= h($aqui . '&descargar=1') ?>">Descargar sus datos (JSON)</a>
          <?php if (!$confirmada): ?>
            <a class="btn sec" href="<?= h($aqui . '&confirmar=1') ?>">Borrar sus datos…</a>
          <?php else: ?>
            <form method="post" action="<?= h($aqui) ?>" class="acciones">
              <input type="hidden" name="accion" value="borrar" />
              <input type="hidden" name="csrf" value="<?= h(csrf()) ?>" />
              <input type="hidden" name="q" value="<?= h($q) ?>" />
              <label class="peq"><input type="checkbox" name="seguro" value="1" required /> Entiendo que no se puede deshacer</label>
              <button class="btn peligro" type="submit">Borrar todo lo de esta persona</button>
            </form>
          <?php endif; ?>
        </div>
      <?php endif; ?>
    <?php endif; ?>

    <h2>Registro de auditoría <small>últimos <?= count($eventos) ?> eventos</small></h2>
    <div class="tabla">
      <?php if (!$eventos): ?>
        <div class="vacio">Sin eventos todavía.</div>
      <?php else: ?>
      <table>
        <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th><th>Usuario</th><th>IP</th></tr></thead>
        <tbody>
        <?php foreach ($eventos as $ev): ?>
          <tr><td class="peq"><?= h($ev['fecha'] ?? '') ?></td><td><?= h($ev['accion'] ?? '') ?></td><td class="peq"><?= h($ev['detalle'] ?? '') ?></td><td class="peq"><?= h($ev['usuario'] ?? '') ?></td><td class="peq"><?= h($ev['ip'] ?? '') ?></td></tr>
        <?php endforeach; ?>
        </tbody>
      </table>
      <?php endif; ?>
    </div>
  </main>
</body>
</html>
