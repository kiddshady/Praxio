'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Praxio — la mudanza de la carpeta de datos

   La app cambió tres veces de nombre, y con el nombre cambia la carpeta que
   Electron usa sola a partir del productName:
     · Rx          hasta la 0.2.3 (%APPDATA%\Rx);
     · Quirotech   de la 0.2.4 a la 0.2.6 (%APPDATA%\Quirotech);
     · Quiron      de la 0.3.0 a la 0.3.2 (%APPDATA%\Quiron);
     · Praxio      desde la 1.0.0 (%APPDATA%\Praxio).
   Quien viene de cualquiera de las anteriores se muda al arrancar: la
   carpeta entera se RENOMBRA (no se copia), así la base, la sal, los respaldos
   y `Local State` —donde safeStorage guarda la llave de «recordar en esta PC»—
   viajan juntos. Si hay datos en más de una vieja, se muda la más nueva y las
   otras no se tocan.

   Nunca deja a nadie con la app vacía:
     · si el renombre falla (un antivirus o un archivo abierto), esta vez usa
       la vieja y en el próximo arranque lo vuelve a intentar;
     · si ya hay una Praxio CON datos, manda esa y las viejas no se tocan;
     · si hay una Praxio SIN datos y una vieja con datos: si está vacía del
       todo se saca y se muda; si tiene algo, usa la vieja (no pisa ni borra
       nada que no sabemos de dónde salió).

   Sin dependencias de Electron, para poder probarla con carpetas temporales
   (test/carpeta.test.mjs).
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const NUEVA = 'Praxio';
/** Los nombres anteriores, del más nuevo al más viejo. */
const VIEJAS = ['Quiron', 'Quirotech', 'Rx'];

/** Hay datos de la app si está la sal o la base: sin eso, es una carpeta de Chromium y nada más. */
function tieneDatos(dir) {
  return fs.existsSync(path.join(dir, 'llave.json')) || fs.existsSync(path.join(dir, 'rx.db'));
}

/**
 * Devuelve la carpeta de datos que hay que usar, mudando la vieja → Praxio si toca.
 * @param {string} appData  %APPDATA% (app.getPath('appData'))
 * @returns {{ dir: string, paso: 'nueva' | 'mudada' | 'vieja' }}
 */
function elegir(appData) {
  const nueva = path.join(appData, NUEVA);
  if (tieneDatos(nueva)) return { dir: nueva, paso: 'nueva' };

  const vieja = VIEJAS.map((n) => path.join(appData, n)).find(tieneDatos);
  if (!vieja) return { dir: nueva, paso: 'nueva' };

  try {
    // Una Praxio vacía del todo no es de nadie: se saca para poder mudar.
    if (fs.existsSync(nueva)) {
      if (fs.readdirSync(nueva).length) return { dir: vieja, paso: 'vieja' };
      fs.rmdirSync(nueva);
    }
    fs.renameSync(vieja, nueva);
    return { dir: nueva, paso: 'mudada' };
  } catch {
    return { dir: vieja, paso: 'vieja' };
  }
}

module.exports = { elegir, tieneDatos };
