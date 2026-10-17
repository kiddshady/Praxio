/* ═══════════════════════════════════════════════════════════════════════════
   Quiron — genera el ícono en todos sus tamaños.

     npm run icon

   El dibujo vive en build/icono.mjs: la vara de Asclepio con la serpiente
   enroscada como una hélice de verdad, en dos versiones. La grande lleva las
   dos vueltas y cuarto, las escamas, el grano y la retícula de electro; la
   CHICA (vuelta y cuarto, trazos gruesos, sin textura) es la que va de 32 px
   para abajo, porque a ese tamaño cada detalle es medio píxel de barro.

   Sale todo de acá, y todo tiene que salir de acá:
     build/icon.png                1024, el que electron-builder usa de base
     build/icon.ico                16/20/24/32 chica · 40/48/64/128/256 grande
     renderer/img/marca.png        256, splash y cerradura
     renderer/img/marca-chica.png  y @2x, la de la titlebar (18 px)

   Se rasteriza con el Chromium de Electron, dibujando el SVG en un canvas al
   tamaño final: así cada tamaño se pinta a su medida en vez de achicar el
   grande, y el canal alfa de las esquinas sale limpio.
   ═══════════════════════════════════════════════════════════════════════════ */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RAIZ = path.join(__dirname, '..');
const CHICA = [16, 20, 24, 32];
const GRANDE = [40, 48, 64, 128, 256];

/* Un .ico a mano. Los tamaños hasta 64 van como DIB de 32 bits (BGRA de abajo
   para arriba, más la máscara AND en cero); de 128 para arriba como PNG
   embebido. GDI+ no lee una entrada de 256 en DIB (devuelve la de 128), y sin
   comprimir pesaría 262 KB. */
function armarIco(entradas) {
  const blobs = entradas.map(({ lado, rgba, png }) => {
    if (lado >= 128) return png;
    const fila = lado * 4, mascara = Math.ceil(lado / 32) * 4 * lado;
    const b = Buffer.alloc(40 + fila * lado + mascara);
    b.writeUInt32LE(40, 0); b.writeInt32LE(lado, 4); b.writeInt32LE(lado * 2, 8);
    b.writeUInt16LE(1, 12); b.writeUInt16LE(32, 14);
    b.writeUInt32LE(fila * lado + mascara, 20);
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const o = (y * lado + x) * 4, d = 40 + (lado - 1 - y) * fila + x * 4;
        b[d] = rgba[o + 2]; b[d + 1] = rgba[o + 1]; b[d + 2] = rgba[o]; b[d + 3] = rgba[o + 3];
      }
    }
    return b;
  });
  const cab = Buffer.alloc(6 + 16 * entradas.length);
  cab.writeUInt16LE(1, 2); cab.writeUInt16LE(entradas.length, 4);
  let off = cab.length;
  entradas.forEach(({ lado }, i) => {
    const e = 6 + i * 16;
    cab[e] = lado >= 256 ? 0 : lado; cab[e + 1] = lado >= 256 ? 0 : lado;
    cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(blobs[i].length, e + 8); cab.writeUInt32LE(off, e + 12);
    off += blobs[i].length;
  });
  return Buffer.concat([cab, ...blobs]);
}

app.whenReady().then(async () => {
  const { icono } = await import(pathToFileURL(path.join(__dirname, 'icono.mjs')).href);
  const svgs = { grande: icono(), chica: icono({ chico: true }) };

  const win = new BrowserWindow({ show: false, width: 200, height: 200 });
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><meta charset="utf-8">');

  /* Dibuja un SVG al lado pedido y devuelve el PNG y los píxeles crudos. */
  const pintar = (svg, lado) => win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = ${lado};
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, ${lado}, ${lado});
    return { png: c.toDataURL('image/png'), rgba: Array.from(g.getImageData(0, 0, ${lado}, ${lado}).data) };
  })()`);
  const png = (r) => Buffer.from(r.png.split(',')[1], 'base64');

  const escribir = (rel, buf) => {
    fs.mkdirSync(path.dirname(path.join(RAIZ, rel)), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, rel), buf);
    console.log('  ' + rel.padEnd(32) + (buf.length / 1024).toFixed(1) + ' KB');
  };

  escribir('build/icon.png', png(await pintar(svgs.grande, 1024)));
  escribir('renderer/img/marca.png', png(await pintar(svgs.grande, 256)));
  escribir('renderer/img/marca-chica.png', png(await pintar(svgs.chica, 18)));
  escribir('renderer/img/marca-chica@2x.png', png(await pintar(svgs.chica, 36)));

  const entradas = [];
  for (const lado of [...CHICA, ...GRANDE]) {
    const r = await pintar(CHICA.includes(lado) ? svgs.chica : svgs.grande, lado);
    entradas.push({ lado, rgba: r.rgba, png: png(r) });
  }
  escribir('build/icon.ico', armarIco(entradas));

  app.exit(0);
}).catch((err) => { console.error(err); app.exit(1); });
