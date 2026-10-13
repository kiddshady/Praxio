/* ═══════════════════════════════════════════════════════════════════════════
   La plantilla retro tal como la eligió Fran en la maqueta (13 oct 2026,
   «La de Quirotech»). Lo que se mide acá es lo que no se nota a simple vista
   en un humo: que los medicamentos salgan numerados, que la hoja no pida una
   fuente que ya no viaja en el paquete y que el sello conserve su «Goma 60 %».
   Que la receta entre en la A5 se midió renderizando (sobran ~3,4 mm).
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { juego } = await import(pathToFileURL(path.join(ROOT, 'renderer/js/hoja.js')).href);
const css = fs.readFileSync(path.join(ROOT, 'renderer/css/hoja.css'), 'utf8');

let pass = 0; let fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FALLA ${n} ${x}`); } };

console.log('\n1. Medicamentos numerados');
{
  const html = juego({
    plantilla: 'retro', paciente: { apellido_nombre: 'GÓMEZ, María' },
    items: [{ nombre: 'Amoxicilina 500 mg' }, { nombre: 'Ibuprofeno 600 mg' }, { nombre: 'Omeprazol 20 mg' }],
  });
  const hojas = html.split('<section').slice(1);
  ok('salen las dos hojas', hojas.length === 2);
  for (const [i, h] of hojas.entries()) {
    const nums = [...h.matchAll(/class="num">(\d+)\.</g)].map((m) => Number(m[1]));
    ok(`la hoja ${i + 1} numera 1, 2, 3 en orden`, nums.join() === '1,2,3', nums.join());
  }
  ok('solo el duplicado lleva el sello', !hojas[0].includes('DUPLICADO') && hojas[1].includes('DUPLICADO'));
}

console.log('\n2. Las otras plantillas no cambian');
{
  const rpe = juego({ plantilla: 'rpe', items: [{ nombre: 'A' }] });
  ok('la RPE no numera con la clase de la retro', !rpe.includes('class="num"'));
}

console.log('\n3. La hoja');
{
  const retro = css.slice(css.indexOf('/* ── Plantilla retro'));
  ok('T2 en 11,5 pt', /--retro-t2:\s*11\.5pt;/.test(retro));
  ok('ninguna regla pide Courier Prime', !/font-family:[^;]*Courier/.test(css));
  ok('el sello está al 60 % de goma (capa pareja al 40 %)', /--goma-liso:\s*\.4;/.test(retro));
  ok('y la máscara junta esa capa con el desgaste',
    /mask-image:\s*linear-gradient\(rgb\(0 0 0 \/ var\(--goma-liso\)\)[^;]*desgaste\.png/.test(retro));
  const fuentes = [...css.matchAll(/url\('\.\.\/(fonts\/[^']+)'\)/g)].map((m) => m[1]);
  const faltan = fuentes.filter((f) => !fs.existsSync(path.join(ROOT, 'renderer', f)));
  ok('cada fuente que pide la hoja existe', fuentes.length > 0 && faltan.length === 0, faltan.join(', '));
}

console.log(`\n═══ ${pass} ok · ${fail} fallas ═══`);
process.exit(fail ? 1 : 0);
