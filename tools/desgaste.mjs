/* Genera renderer/img/desgaste.png: la máscara que gasta el sello de goma del
   DUPLICADO en la plantilla retro. Casi todo opaco, con un 14 % de puntos que
   dejan pasar poco o nada de tinta, como un sello que no apoyó parejo.

   Va como archivo y no generado en vivo porque la ventana de impresión tiene
   `default-src 'none'`: ni canvas → data: ni nada que no venga del paquete.
   La semilla es fija para que regenerarlo dé el mismo PNG byte a byte.

     node tools/desgaste.mjs */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const LADO = 140;
let s = 0x5e110;
const azar = () => {               // mulberry32
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const filas = [];
for (let y = 0; y < LADO; y++) {
  const f = Buffer.alloc(1 + LADO * 4);   // byte 0: filtro "ninguno"
  for (let x = 0; x < LADO; x++) {
    const r = azar();
    const a = r < 0.14 ? azar() * 90 : 255 - azar() * 40;
    f[1 + x * 4 + 3] = Math.round(a);    // negro, solo cambia el alfa
  }
  filas.push(f);
}

const crcTabla = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => { let c = ~0; for (const x of b) c = crcTabla[(c ^ x) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
const trozo = (tipo, datos) => {
  const t = Buffer.from(tipo, 'ascii');
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const suma = Buffer.alloc(4); suma.writeUInt32BE(crc(Buffer.concat([t, datos])));
  return Buffer.concat([largo, t, datos, suma]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(LADO, 0); ihdr.writeUInt32BE(LADO, 4);
ihdr[8] = 8; ihdr[9] = 6;                 // 8 bits, RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  trozo('IHDR', ihdr),
  trozo('IDAT', zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
  trozo('IEND', Buffer.alloc(0)),
]);

const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'img', 'desgaste.png');
fs.writeFileSync(destino, png);
console.log(`${path.relative(process.cwd(), destino)} · ${png.length} bytes`);
