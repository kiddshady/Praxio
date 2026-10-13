'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   Quirotech — la mudanza de la carpeta de datos

   Hasta la 0.2.3 los datos vivían en %APPDATA%\Rx, el nombre de antes, fijado
   a mano para que nadie abriera la app vacía al cambiar de nombre. Desde la
   0.2.4 viven en %APPDATA%\Quirotech, que es lo que Electron usa solo a partir
   del productName. Quien viene de antes se muda al arrancar: la carpeta entera
   se RENOMBRA (no se copia), así la base, la sal, los respaldos y `Local State`
   —donde safeStorage guarda la llave de «recordar en esta PC»— viajan juntos.

   Nunca deja a nadie con la app vacía:
     · si el renombre falla (un antivirus o un archivo abierto), esta vez usa
       Rx y en el próximo arranque lo vuelve a intentar;
     · si ya hay una Quirotech CON datos, manda esa y Rx no se toca;
     · si hay una Quirotech SIN datos y una Rx con datos: si está vacía del
       todo se saca y se muda; si tiene algo, usa Rx (no pisa ni borra nada
       que no sabemos de dónde salió).

   Sin dependencias de Electron, para poder probarla con carpetas temporales
   (test/carpeta.test.mjs).
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

/** Hay datos de la app si está la sal o la base: sin eso, es una carpeta de Chromium y nada más. */
function tieneDatos(dir) {
  return fs.existsSync(path.join(dir, 'llave.json')) || fs.existsSync(path.join(dir, 'rx.db'));
}

/**
 * Devuelve la carpeta de datos que hay que usar, mudando Rx → Quirotech si toca.
 * @param {string} appData  %APPDATA% (app.getPath('appData'))
 * @returns {{ dir: string, paso: 'nueva' | 'mudada' | 'vieja' }}
 */
function elegir(appData) {
  const nueva = path.join(appData, 'Quirotech');
  const vieja = path.join(appData, 'Rx');

  if (tieneDatos(nueva) || !tieneDatos(vieja)) return { dir: nueva, paso: 'nueva' };
  try {
    // Una Quirotech vacía del todo no es de nadie: se saca para poder mudar.
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
