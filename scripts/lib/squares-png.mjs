// Pătrățelele din e-mailuri: câte unul pentru fiecare proiect, în culoarea riscului, pe fundal transparent, ca să arate
// la fel pe tema deschisă și pe cea întunecată a clientului de e-mail. PNG scris direct (zlib), fără Chrome: imaginea
// se face în aceeași rulare cu e-mailul, din aceleași date.
import zlib from 'node:zlib';

/** Masca unui pătrat cu colțuri rotunjite, cu margini netezite (16 eșantioane pe pixel). */
function squareMask(size, radius) {
  const mask = new Float32Array(size * size);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const px = x + (i + 0.5) / N;
          const py = y + (j + 0.5) / N;
          const dx = Math.max(radius - px, 0, px - (size - radius));
          const dy = Math.max(radius - py, 0, py - (size - radius));
          if (dx * dx + dy * dy <= radius * radius) inside++;
        }
      }
      mask[y * size + x] = inside / (N * N);
    }
  }
  return mask;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Un pătrat pentru fiecare culoare din `colors` (#rrggbb), pe rânduri de câte `cols`, de la stânga la dreapta.
 * Dimensiunile sunt în pixeli ai imaginii; în e-mail o afișăm la jumătate, ca să fie clară pe ecranele retina.
 * Imaginea are mereu lățimea a `cols` pătrate, chiar dacă sunt mai puține: toate imaginile au aceeași scară.
 */
export function squaresPng(colors, { cols = 30, cell = 34, gap = 6, radius = 6 } = {}) {
  const size = cell - gap;
  const rows = Math.max(1, Math.ceil(colors.length / cols));
  const width = cols * cell - gap;
  const height = rows * cell - gap;
  const mask = squareMask(size, radius);
  // Fiecare rând începe cu octetul de filtru (0 = fără filtru), apoi RGBA.
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  colors.forEach((hex, k) => {
    const [r, g, b] = rgb(hex);
    const x0 = (k % cols) * cell;
    const y0 = Math.floor(k / cols) * cell;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = mask[y * size + x];
        if (!a) continue;
        const o = (y0 + y) * stride + 1 + (x0 + x) * 4;
        raw[o] = r;
        raw[o + 1] = g;
        raw[o + 2] = b;
        raw[o + 3] = Math.round(a * 255);
      }
    }
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 biți, RGBA, fără întrețesere
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { png, width, height };
}
