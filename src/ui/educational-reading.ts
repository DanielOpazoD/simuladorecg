import type { ECGCase, Signal } from '../engine/types';
import { modelIntervals } from './model-intervals';
import { dominantBeats, type StructuredDescription } from './structured-description';
import { avReadingLesson } from './av-reading';

/** Original Spanish teaching copy, developed with Fable and reviewed against current events.
 * Conceptual references: HITL chapters 06 (intervals), 09 (sinus), 10 (atrial),
 * 13 (AV block), 14 (BBB). Not a new diagnostic classifier or anatomical simulation.
 */
function wenckebachVerified(c: ECGCase, s: Signal): boolean {
  // Copy and diagram must demonstrate the same full cycle, including PR reset,
  // within the visible acquisition rather than a later part of the long record.
  return avReadingLesson(c, s) !== null;
}

/** Read-only: no synthesis, measurement or changes to the structured/exported description. */
export function educationalReading(c: ECGCase, s: Signal, d: StructuredDescription): string {
  if (c.artifacts.reversed)
    return 'La inversión de los brazos cambia las polaridades de las derivaciones de miembros. Comprueba la conexión antes de relacionar el eje del registro con la anatomía.';
  if (c.rhythm === 'paced' && s.events.spikes.length)
    return 'Una espícula indica un estímulo, pero no garantiza su captura. Comprueba si después aparece la activación esperada y distingue los complejos propios de los estimulados.';
  const organized = s.events.beats.some(b => Number.isFinite(b.qrs) && b.qrs! > 0);
  if (c.rhythm === 'vf' || c.rhythm === 'asystole' || !organized)
    return 'Sin complejos delimitables no se pueden situar con seguridad los intervalos PR, QRS y QT. Observa primero si hay actividad organizada o una oscilación continua.';
  if (c.rhythm === 'torsades')
    return 'La forma de los complejos cambia a lo largo del registro. Compara varios latidos antes de elegir uno como representativo.';
  if (c.rhythm === 'af')
    return 'En la fibrilación auricular no hay una P organizada con la que definir el PR. Sigue los RR en un tramo largo y observa cómo varían de un latido a otro.';
  if (c.rhythm === 'flutter')
    return 'La actividad auricular repetitiva puede continuar entre los QRS y ocupar la línea de base. Cuenta sus ondas entre los complejos para entender la relación de conducción.';

  const atria = s.events.atria, blocked = atria.some(a => !a.conducted), mi = modelIntervals(c, s);
  if (c.rhythm === 'sinus' && c.av !== 'normal') {
    if (c.av === 'complete' && blocked && !atria.some(a => a.conducted) && !s.events.beats.some(b => b.pr !== undefined))
      return 'La actividad auricular y el ritmo ventricular siguen secuencias independientes en este escenario. Una P cercana a un QRS no demuestra que lo haya conducido ni localiza el nivel del bloqueo.';
    if (c.av === 'two_one' && blocked)
      return 'Una relación de conducción 2:1 no basta para clasificar un bloqueo como Mobitz I o II. Busca si hay una secuencia de P conducidas consecutivas que permita comparar sus PR.';
    if (c.av === 'mobitz1')
      return wenckebachVerified(c, s)
        ? 'En este tramo el PR se alarga antes de que una P quede sin QRS y la secuencia vuelva a empezar. Compara el primer PR después de la pausa con el último antes de la siguiente.'
        : 'En este tramo no se verifica una progresión completa del PR entre pausas. Relaciona cada P con su QRS antes de atribuirle una secuencia de conducción.';
    if ((c.av === 'mobitz2' || c.av === 'high') && blocked)
      return 'Hay impulsos auriculares del modelo que no conducen a un QRS. Compara los PR de los latidos conducidos y busca las P que quedan entre ellos; esta relación no localiza por sí sola el nivel del bloqueo.';
    if (c.av === 'first' && mi.pr !== null && mi.pr > 200 && atria.length && !blocked)
      return 'El PR prolongado expresa un retraso de la conducción, mientras las P de este tramo siguen conduciendo. Sigue la secuencia P–QRS para distinguir retraso de falta de conducción.';
    return 'Compara las P con los QRS y revisa los PR que pueden medirse. El nombre del caso no sustituye esa comprobación en el registro actual.';
  }
  if (c.ectopy !== 'none' && (s.events.beats.some(b => b.kind === 'pvc') || atria.some(a => a.kind === 'ectopic')))
    return 'Para entender un latido prematuro, importa cuándo aparece y cómo se relaciona con la actividad auricular. Compáralo con los complejos vecinos sin mezclar sus intervalos.';
  const dom = dominantBeats(s), ventricular = dom.length > 0 && s.events.beats[dom[0]].kind !== 'normal';
  if ((mi.qrs ?? 0) >= 120 || ventricular || c.conduction !== 'normal')
    return d.lines.some(l => l.key === 'ST/QRS')
      ? 'La activación ventricular y la repolarización están relacionadas, pero un QRS ancho no explica por sí solo todos los cambios del ST–T. Compara la dirección del ST con la del QRS en cada derivación.'
      : 'Observa el inicio y el final del QRS y compáralos entre derivaciones. La forma del complejo ayuda a estudiar la activación; su anchura por sí sola no explica la causa de un cambio del ST–T.';
  if (c.rhythm === 'junctional')
    return 'En un ritmo de la unión, la relación temporal entre la actividad auricular y el QRS puede cambiar. Busca la P antes, dentro o después del complejo, sin suponer un PR si no puedes identificarla.';
  if (c.ischemia !== 'none')
    return 'Relaciona el ST y la T con el QRS de esa misma derivación. Compara derivaciones vecinas y busca cambios opuestos en otras zonas del registro, sin interpretar una derivación de forma aislada.';
  const allConducted = atria.length > 0 && !blocked;
  return allConducted && mi.pr !== null && mi.prRange === null
    ? `Las P de este tramo conducen a los ventrículos con PR similares. Sigue la secuencia P–QRS y compara la polaridad de la P en II y ${c.view.cabrera ? '−aVR' : 'aVR'} para estudiar su origen.`
    : 'Sigue la secuencia P–QRS y compara los intervalos entre latidos. Describe primero lo que puedes identificar en el trazado antes de interpretar su mecanismo.';
}
