// Gera ícones PNG simples (fundo + silhueta de livro) sem dependências externas.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeIcon(size, { maskable }) {
  const bg = [43, 76, 90]; // azul petróleo, combina com o tema do app
  const page = [245, 240, 230];
  const spine = [200, 160, 90];

  const pixels = Buffer.alloc(size * size * 4);
  const margin = maskable ? Math.round(size * 0.2) : Math.round(size * 0.14);

  // área "segura" do livro
  const bookLeft = margin;
  const bookRight = size - margin;
  const bookTop = Math.round(size * 0.22);
  const bookBottom = size - Math.round(size * 0.22);
  const spineX = size / 2;
  const spineW = Math.max(2, Math.round(size * 0.02));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = bg;
      const inBook = x >= bookLeft && x < bookRight && y >= bookTop && y < bookBottom;
      if (inBook) {
        color = page;
        if (Math.abs(x - spineX) < spineW) color = spine;
      }
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  const rawWithFilter = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rawWithFilter[y * (size * 4 + 1)] = 0; // sem filtro
    pixels.copy(rawWithFilter, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(rawWithFilter);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makeIcon(192, { maskable: false }));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makeIcon(512, { maskable: false }));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), makeIcon(512, { maskable: true }));
console.log('Ícones gerados em', outDir);
