/* ═══════════════════════════════════════════════════════════════════════════
   La mudanza a %APPDATA%\Praxio desde los nombres anteriores, Quiron,
   Quirotech y Rx (src/carpeta.cjs).

   Del otro lado hay una médica con historias clínicas reales en una de esas
   carpetas: lo que importa es que en NINGÚN caso arranque con la app vacía
   ni se pise nada. Cada caso arma un %APPDATA% falso en una carpeta
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

const NUEVA = 'Praxio';
/** Del más nuevo al más viejo, como en carpeta.cjs. */
const VIEJAS = ['Quiron', 'Quirotech', 'Rx'];

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'px-carpeta-'));
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
  ok(`sin nada, usa ${NUEVA}`, r.dir === path.join(a, NUEVA) && r.paso === 'nueva');
  ok('y no inventa ninguna vieja', VIEJAS.every((v) => !hay(a, v)));
}

for (const V of VIEJAS) {
  console.log(`\n2. Viene de ${V}: se muda entera`);
  {
    const a = appData();
    const vieja = path.join(a, V);
    poner(vieja, 'rx.db', 'base');
    poner(vieja, 'llave.json', 'sal');
    poner(vieja, 'Local State', 'llave-de-safeStorage');
    poner(vieja, path.join('respaldos', 'rx-v1.db'), 'respaldo');
    const r = elegir(a);
    const nn = path.join(a, NUEVA);
    ok(`[${V}] devuelve ${NUEVA} como mudada`, r.dir === nn && r.paso === 'mudada', JSON.stringify(r));
    ok(`[${V}] la base llegó intacta`, leer(nn, 'rx.db') === 'base');
    ok(`[${V}] la sal llegó intacta`, leer(nn, 'llave.json') === 'sal');
    ok(`[${V}] Local State viajó con ellas (la contraseña recordada)`, leer(nn, 'Local State') === 'llave-de-safeStorage');
    ok(`[${V}] los respaldos también`, leer(nn, path.join('respaldos', 'rx-v1.db')) === 'respaldo');
    ok(`[${V}] la vieja ya no está`, !hay(vieja));
    const r2 = elegir(a);
    ok(`[${V}] el arranque siguiente usa ${NUEVA} sin mudar de nuevo`, r2.dir === nn && r2.paso === 'nueva');
  }

  console.log(`\n3. ${NUEVA} ya tiene datos: manda esa (${V} no se toca)`);
  {
    const a = appData();
    poner(path.join(a, V), 'rx.db', 'vieja');
    poner(path.join(a, NUEVA), 'rx.db', 'nueva');
    const r = elegir(a);
    ok(`[${V}] usa ${NUEVA}`, r.dir === path.join(a, NUEVA) && r.paso === 'nueva');
    ok(`[${V}] la vieja queda como estaba`, leer(path.join(a, V), 'rx.db') === 'vieja');
    ok(`[${V}] ${NUEVA} queda como estaba`, leer(path.join(a, NUEVA), 'rx.db') === 'nueva');
  }

  console.log(`\n4. ${NUEVA} existe vacía del todo: se saca y se muda ${V}`);
  {
    const a = appData();
    poner(path.join(a, V), 'llave.json', 'sal');
    fs.mkdirSync(path.join(a, NUEVA));
    const r = elegir(a);
    ok(`[${V}] se mudó`, r.paso === 'mudada' && leer(path.join(a, NUEVA), 'llave.json') === 'sal');
  }

  console.log(`\n5. ${NUEVA} tiene algo que no son datos: no se pisa (${V})`);
  {
    const a = appData();
    poner(path.join(a, V), 'rx.db', 'base');
    poner(path.join(a, NUEVA), 'Preferences', '{}');
    const r = elegir(a);
    ok(`[${V}] usa la vieja`, r.dir === path.join(a, V) && r.paso === 'vieja');
    ok(`[${V}] no tocó ninguna de las dos`,
      leer(path.join(a, V), 'rx.db') === 'base' && leer(path.join(a, NUEVA), 'Preferences') === '{}');
  }

  console.log(`\n6. ${V} sin datos de la app (solo caché de Chromium): no se muda`);
  {
    const a = appData();
    poner(path.join(a, V), path.join('GPUCache', 'data_0'));
    const r = elegir(a);
    ok(`[${V}] arranca de cero en ${NUEVA}`, r.dir === path.join(a, NUEVA) && r.paso === 'nueva');
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

/* Con datos en dos viejas se muda la más nueva y la otra no se toca; con la
   más nueva solo de caché, se muda la otra. Cada par de nombres viejos. */
for (let i = 0; i < VIEJAS.length; i++) {
  for (let j = i + 1; j < VIEJAS.length; j++) {
    const [nueva, vieja] = [VIEJAS[i], VIEJAS[j]];
    console.log(`\n8. Hay datos en ${nueva} Y en ${vieja}: se muda ${nueva}`);
    {
      const a = appData();
      poner(path.join(a, vieja), 'rx.db', `de-${vieja}`);
      poner(path.join(a, nueva), 'rx.db', `de-${nueva}`);
      const r = elegir(a);
      ok(`se mudó ${nueva}`, r.paso === 'mudada' && leer(path.join(a, NUEVA), 'rx.db') === `de-${nueva}`);
      ok(`${vieja} queda como estaba`, leer(path.join(a, vieja), 'rx.db') === `de-${vieja}`);
    }

    console.log(`\n9. ${nueva} sin datos y ${vieja} con datos: se muda ${vieja}`);
    {
      const a = appData();
      poner(path.join(a, nueva), path.join('GPUCache', 'data_0'));
      poner(path.join(a, vieja), 'llave.json', 'sal');
      const r = elegir(a);
      ok(`se mudó ${vieja}`, r.paso === 'mudada' && leer(path.join(a, NUEVA), 'llave.json') === 'sal');
      ok(`la ${nueva} de caché queda donde estaba`, hay(path.join(a, nueva)));
    }
  }
}

fs.rmSync(RAIZ, { recursive: true, force: true });
console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
