/* ═══════════════════════════════════════════════════════════════════════════
   La mudanza a %APPDATA%\Quiron desde los nombres anteriores, Quirotech y Rx
   (src/carpeta.cjs).

   Del otro lado hay una médica con historias clínicas reales en una de esas
   dos carpetas: lo que importa es que en NINGÚN caso arranque con la app
   vacía ni se pise nada. Cada caso arma un %APPDATA% falso en una carpeta
   temporal, y los casos de la mudanza se corren una vez por cada nombre viejo.
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
  ok('sin nada, usa Quiron', r.dir === path.join(a, 'Quiron') && r.paso === 'nueva');
  ok('y no inventa ninguna vieja', !hay(a, 'Rx') && !hay(a, 'Quirotech'));
}

for (const V of ['Quirotech', 'Rx']) {
  console.log(`\n2. Viene de ${V}: se muda entera`);
  {
    const a = appData();
    const vieja = path.join(a, V);
    poner(vieja, 'rx.db', 'base');
    poner(vieja, 'llave.json', 'sal');
    poner(vieja, 'Local State', 'llave-de-safeStorage');
    poner(vieja, path.join('respaldos', 'rx-v1.db'), 'respaldo');
    const r = elegir(a);
    const qn = path.join(a, 'Quiron');
    ok(`[${V}] devuelve Quiron como mudada`, r.dir === qn && r.paso === 'mudada', JSON.stringify(r));
    ok(`[${V}] la base llegó intacta`, leer(qn, 'rx.db') === 'base');
    ok(`[${V}] la sal llegó intacta`, leer(qn, 'llave.json') === 'sal');
    ok(`[${V}] Local State viajó con ellas (la contraseña recordada)`, leer(qn, 'Local State') === 'llave-de-safeStorage');
    ok(`[${V}] los respaldos también`, leer(qn, path.join('respaldos', 'rx-v1.db')) === 'respaldo');
    ok(`[${V}] la vieja ya no está`, !hay(vieja));
    const r2 = elegir(a);
    ok(`[${V}] el arranque siguiente usa Quiron sin mudar de nuevo`, r2.dir === qn && r2.paso === 'nueva');
  }

  console.log(`\n3. Quiron ya tiene datos: manda esa (${V} no se toca)`);
  {
    const a = appData();
    poner(path.join(a, V), 'rx.db', 'vieja');
    poner(path.join(a, 'Quiron'), 'rx.db', 'nueva');
    const r = elegir(a);
    ok(`[${V}] usa Quiron`, r.dir === path.join(a, 'Quiron') && r.paso === 'nueva');
    ok(`[${V}] la vieja queda como estaba`, leer(path.join(a, V), 'rx.db') === 'vieja');
    ok(`[${V}] Quiron queda como estaba`, leer(path.join(a, 'Quiron'), 'rx.db') === 'nueva');
  }

  console.log(`\n4. Quiron existe vacía del todo: se saca y se muda ${V}`);
  {
    const a = appData();
    poner(path.join(a, V), 'llave.json', 'sal');
    fs.mkdirSync(path.join(a, 'Quiron'));
    const r = elegir(a);
    ok(`[${V}] se mudó`, r.paso === 'mudada' && leer(path.join(a, 'Quiron'), 'llave.json') === 'sal');
  }

  console.log(`\n5. Quiron tiene algo que no son datos: no se pisa (${V})`);
  {
    const a = appData();
    poner(path.join(a, V), 'rx.db', 'base');
    poner(path.join(a, 'Quiron'), 'Preferences', '{}');
    const r = elegir(a);
    ok(`[${V}] usa la vieja`, r.dir === path.join(a, V) && r.paso === 'vieja');
    ok(`[${V}] no tocó ninguna de las dos`,
      leer(path.join(a, V), 'rx.db') === 'base' && leer(path.join(a, 'Quiron'), 'Preferences') === '{}');
  }

  console.log(`\n6. ${V} sin datos de la app (solo caché de Chromium): no se muda`);
  {
    const a = appData();
    poner(path.join(a, V), path.join('GPUCache', 'data_0'));
    const r = elegir(a);
    ok(`[${V}] arranca de cero en Quiron`, r.dir === path.join(a, 'Quiron') && r.paso === 'nueva');
    ok(`[${V}] la vieja queda donde estaba`, hay(path.join(a, V)));
  }

  console.log(`\n7. El renombre falla: se usa ${V}, nunca vacía`);
  {
    const a = appData();
    poner(path.join(a, V), 'rx.db', 'base');
    const original = fs.renameSync;
    fs.renameSync = () => { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; };
    let r;
    try { r = elegir(a); } finally { fs.renameSync = original; }
    ok(`[${V}] usa la vieja esta vez`, r.dir === path.join(a, V) && r.paso === 'vieja');
    ok(`[${V}] la base sigue ahí`, leer(path.join(a, V), 'rx.db') === 'base');
    const r2 = elegir(a);
    ok(`[${V}] y en el arranque siguiente se muda`, r2.paso === 'mudada');
  }
}

console.log('\n8. Hay datos en Quirotech Y en Rx: se muda la más nueva');
{
  const a = appData();
  poner(path.join(a, 'Rx'), 'rx.db', 'de-rx');
  poner(path.join(a, 'Quirotech'), 'rx.db', 'de-quirotech');
  const r = elegir(a);
  ok('se mudó Quirotech', r.paso === 'mudada' && leer(path.join(a, 'Quiron'), 'rx.db') === 'de-quirotech');
  ok('Rx queda como estaba', leer(path.join(a, 'Rx'), 'rx.db') === 'de-rx');
}

console.log('\n9. Quirotech sin datos y Rx con datos: se muda Rx');
{
  const a = appData();
  poner(path.join(a, 'Quirotech'), path.join('GPUCache', 'data_0'));
  poner(path.join(a, 'Rx'), 'llave.json', 'sal');
  const r = elegir(a);
  ok('se mudó Rx', r.paso === 'mudada' && leer(path.join(a, 'Quiron'), 'llave.json') === 'sal');
  ok('la Quirotech de caché queda donde estaba', hay(path.join(a, 'Quirotech')));
}

fs.rmSync(RAIZ, { recursive: true, force: true });
console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
