/**
 * ¿Es horario de atención ahora, en hora de Lima? Para el aviso de la
 * pantalla de gracias (src/data/contenido.js → HORARIO).
 */
export function enHorario(horario, ahora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ahora)
      .map((p) => [p.type, p.value]),
  );
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday);
  const hora = `${partes.hour}:${partes.minute}`;
  return horario.dias.includes(dia) && hora >= horario.desde && hora < horario.hasta;
}
