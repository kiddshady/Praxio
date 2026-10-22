/* ═══════════════════════════════════════════════════════════════════════════
   Formato de números.

   Existe por un detalle chico y contagioso: `toFixed()` escribe siempre con
   punto, sin mirar el locale. La app terminaba diciendo "2.1 MB" al lado de
   "209,9 mm" — dos separadores decimales distintos en la misma pantalla.

   Lo importante de este test es que salga **lo que diga el locale**. Desde la
   1.0.0 la interfaz está en inglés (en-GB, con punto), así que la última
   sección lo cambia a es-AR y espera comas. Un arreglo que hardcodeara el
   punto pasaría todo lo de arriba y fallaría ahí.
   ═══════════════════════════════════════════════════════════════════════════ */

import { locale, fmtBytes, fmtNum, fmtDur, fmtMoney, relTime } from '../renderer/js/format.js';

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };
const es = (nombre, real, esperado) => ok(`${nombre} → ${esperado}`, real === esperado, `dio ${real}`);

console.log('\n0. El locale de la interfaz');
es('la interfaz va en inglés británico', locale.tag, 'en-GB');

console.log('\n1. Tamaños de archivo');
es('fmtBytes(0)', fmtBytes(0), '0 B');
es('fmtBytes(512)', fmtBytes(512), '512 B');
es('fmtBytes(2202009)', fmtBytes(2202009), '2.1 MB');
es('fmtBytes(98388075)', fmtBytes(98388075), '94 MB');
/* Bajo 10 va con un decimal y arriba sin ninguno: es la regla vieja, que este
   cambio no tiene que tocar. */
es('fmtBytes(1536) — bajo 10, un decimal', fmtBytes(1536), '1.5 kB');
es('fmtBytes(51200) — sobre 10, entero', fmtBytes(51200), '50 kB');
es('los bytes pelados no llevan decimales', fmtBytes(999), '999 B');

console.log('\n2. Números grandes');
es('fmtNum(0)', fmtNum(0), '0');
es('fmtNum(842)', fmtNum(842), '842');
es('fmtNum(4200)', fmtNum(4200), '4.2k');
es('fmtNum(61000)', fmtNum(61000), '61k');
es('fmtNum(1300000)', fmtNum(1300000), '1.3M');
es('fmtNum(-4200)', fmtNum(-4200), '-4.2k');
es('fmtNum(12.5) — bajo mil, con decimales', fmtNum(12.5), '12.5');

console.log('\n3. Duraciones y dinero');
es('fmtDur(840)', fmtDur(840), '840ms');
es('fmtDur(2400)', fmtDur(2400), '2.4s');
es('fmtDur(187000)', fmtDur(187000), '3m 07s');
es('fmtMoney(1.5)', fmtMoney(1.5), 'USD 1.50');
es('fmtMoney(0)', fmtMoney(0), 'USD 0.00');
es('fmtMoney chico lleva 4 decimales', fmtMoney(0.0012), 'USD 0.0012');

console.log('\n4. Sin agrupación de miles');
/* Agrupar mete un separador de miles (la coma en inglés, el punto en es-AR)
   en cifras que ya vienen reducidas: "5,000 TB" se lee mal en los dos. */
ok('un tamaño de cuatro cifras no se agrupa',
  !/[.,]/.test(fmtBytes(5000 * 1024 ** 4)), fmtBytes(5000 * 1024 ** 4));

console.log('\n5. Manda el locale, no el punto');
const original = locale.tag;
try {
  locale.tag = 'es-AR';
  es('es-AR: fmtBytes', fmtBytes(2202009), '2,1 MB');
  es('es-AR: fmtNum', fmtNum(4200), '4,2k');
  es('es-AR: fmtDur', fmtDur(2400), '2,4s');
  es('es-AR: fmtMoney', fmtMoney(1.5), 'USD 1,50');
} finally {
  locale.tag = original;
}
/* Y volver atrás tiene que funcionar: el caché de formateadores se indexa por
   locale, así que un caché mal armado dejaría la app pegada al idioma anterior. */
es('vuelve a en-GB', fmtBytes(2202009), '2.1 MB');

console.log('\n6. Hace cuánto');
const ahora = Date.now();
es('recién', relTime(ahora - 10_000), 'just now');
es('minutos', relTime(ahora - 5 * 60_000), '5 min ago');
es('horas', relTime(ahora - 3 * 3_600_000), '3 h ago');
es('ayer', relTime(ahora - 26 * 3_600_000), 'yesterday');
es('días', relTime(ahora - 4 * 86_400_000), '4 days ago');
es('nunca', relTime(0), 'never');

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══\n`);
process.exit(fail ? 1 : 0);
