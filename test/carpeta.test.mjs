/* ═══════════════════════════════════════════════════════════════════════════
   La mudanza de %APPDATA%\Rx a %APPDATA%\Quirotech (src/carpeta.cjs).

   Del otro lado hay una médica con historias clínicas reales en Rx: lo que
   importa es que en NINGÚN caso arranque con la app vacía ni se pise nada.
   Cada caso arma un %APPDATA% falso en una carpeta temporal.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { elegir } = require('../src/carpeta.cjs');

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-carpeta-'));
let n = 0;
const appData = () => { const d = path.join(RAIZ, String(n++)); fs.mkdirSync(d); return d; };
const poner = (dir, archivo, texto = 'x') => {
  fs.mkdirSync(path.dirname(path.join(dir, archivo)), { recursive: true });
  fs.writeFileSync(path.join(dir, archivo), texto);
};
const leer = (dir, archivo) => fs.readFileSync(path.join(dir, archivo), 'utf8');
const hay = (dir, archivo = '') => fs.existsSync(path.join(dir, archivo));

console.log('\n1. Instalación nueva');
{
  const a = appData();
  const r = elegir(a);
  ok('sin nada, usa Quirotech', r.dir === path.join(a, 'Quirotech') && r.paso === 'nueva');
  ok('y no inventa una Rx', !hay(a, 'Rx'));
}

console.log('\n2. Viene de Rx: se muda entera');
{
  const a = appData();
  const rx = path.join(a, 'Rx');
  poner(rx, 'rx.db', 'base');
  poner(rx, 'llave.json', 'sal');
  poner(rx, 'Local State', 'llave-de-safeStorage');
  poner(rx, path.join('respaldos', 'rx-v1.db'), 'respaldo');
  const r = elegir(a);
  const qt = path.join(a, 'Quirotech');
  ok('devuelve Quirotech como mudada', r.dir === qt && r.paso === 'mudada', JSON.stringify(r));
  ok('la base llegó intacta', leer(qt, 'rx.db') === 'base');
  ok('la sal llegó intacta', leer(qt, 'llave.json') === 'sal');
  ok('Local State viajó con ellas (la contraseña recordada)', leer(qt, 'Local State') === 'llave-de-safeStorage');
  ok('los respaldos también', leer(qt, path.join('respaldos', 'rx-v1.db')) === 'respaldo');
  ok('Rx ya no está', !hay(rx));
  const r2 = elegir(a);
  ok('el arranque siguiente usa Quirotech sin mudar de nuevo', r2.dir === qt && r2.paso === 'nueva');
}

console.log('\n3. Quirotech ya tiene datos: manda esa');
{
  const a = appData();
  poner(path.join(a, 'Rx'), 'rx.db', 'vieja');
  poner(path.join(a, 'Quirotech'), 'rx.db', 'nueva');
  const r = elegir(a);
  ok('usa Quirotech', r.dir === path.join(a, 'Quirotech') && r.paso === 'nueva');
  ok('Rx queda como estaba', leer(path.join(a, 'Rx'), 'rx.db') === 'vieja');
  ok('Quirotech queda como estaba', leer(path.join(a, 'Quirotech'), 'rx.db') === 'nueva');
}

console.log('\n4. Quirotech existe vacía del todo: se saca y se muda');
{
  const a = appData();
  poner(path.join(a, 'Rx'), 'llave.json', 'sal');
  fs.mkdirSync(path.join(a, 'Quirotech'));
  const r = elegir(a);
  ok('se mudó', r.paso === 'mudada' && leer(path.join(a, 'Quirotech'), 'llave.json') === 'sal');
}

console.log('\n5. Quirotech tiene algo que no son datos: no se pisa');
{
  const a = appData();
  poner(path.join(a, 'Rx'), 'rx.db', 'base');
  poner(path.join(a, 'Quirotech'), 'Preferences', '{}');
  const r = elegir(a);
  ok('usa Rx', r.dir === path.join(a, 'Rx') && r.paso === 'vieja');
  ok('no tocó ninguna de las dos',
    leer(path.join(a, 'Rx'), 'rx.db') === 'base' && leer(path.join(a, 'Quirotech'), 'Preferences') === '{}');
}

console.log('\n6. Rx sin datos de la app (solo caché de Chromium): no se muda');
{
  const a = appData();
  poner(path.join(a, 'Rx'), path.join('GPUCache', 'data_0'));
  const r = elegir(a);
  ok('arranca de cero en Quirotech', r.dir === path.join(a, 'Quirotech') && r.paso === 'nueva');
  ok('Rx queda donde estaba', hay(path.join(a, 'Rx')));
}

console.log('\n7. El renombre falla: se usa Rx, nunca vacía');
{
  const a = appData();
  poner(path.join(a, 'Rx'), 'rx.db', 'base');
  const original = fs.renameSync;
  fs.renameSync = () => { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; };
  let r;
  try { r = elegir(a); } finally { fs.renameSync = original; }
  ok('usa Rx esta vez', r.dir === path.join(a, 'Rx') && r.paso === 'vieja');
  ok('la base sigue ahí', leer(path.join(a, 'Rx'), 'rx.db') === 'base');
  const r2 = elegir(a);
  ok('y en el arranque siguiente se muda', r2.paso === 'mudada');
}

fs.rmSync(RAIZ, { recursive: true, force: true });
console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
