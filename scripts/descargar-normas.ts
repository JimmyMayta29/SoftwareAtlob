import fs from 'fs';
import path from 'path';

async function fetchAndSave(url: string, outputPath: string) {
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log(`Saved ${outputPath} (${buffer.byteLength} bytes)`);
}

async function main() {
  const normasDir = path.join(process.cwd(), 'docs', 'evidencia', 'normas');
  if (!fs.existsSync(normasDir)) {
    fs.mkdirSync(normasDir, { recursive: true });
  }

  // 1. Ley 32219 (El Peruano)
  await fetchAndSave(
    'https://busquedas.elperuano.pe/dispositivo/NL/2357993-3',
    path.join(normasDir, 'ley_32219_elperuano.html')
  );

  // 2. RS 037-2002/SUNAT
  await fetchAndSave(
    'https://www.sunat.gob.pe/legislacion/superin/2002/037.htm',
    path.join(normasDir, 'rs_037_2002_sunat.html')
  );

  // Probe candidates for Ley 29173 and Reglamento IGV
  const candidates = [
    'https://www.sunat.gob.pe/legislacion/superin/2004/256.htm',
    'https://www.sunat.gob.pe/legislacion/igv/regla/cap6.htm',
    'https://www.sunat.gob.pe/legislacion/igv/regla/cap1.htm',
    'https://www.sunat.gob.pe/legislacion/igv/regla/titulo1.htm',
    'https://www.sunat.gob.pe/legislacion/igv/regla/fdetalle.htm',
    'https://www.sunat.gob.pe/legislacion/igv/regla/findice.html',
    'https://www.sunat.gob.pe/legislacion/igv/ley/capitul5.pdf',
    'https://www.sunat.gob.pe/legislacion/igv/ley/capitul6.pdf',
    'https://busquedas.elperuano.pe/normaslegales/ley-que-regula-el-regimen-de-percepciones-del-impuesto-general-ley-n-29173-157930-1/',
    'https://busquedas.elperuano.pe/dispositivo/NL/157930-1',
    'https://www.mef.gob.pe/contenidos/conta_publ/con_nor_co/vigentes/PCGE_2019.pdf'
  ];

  for (const c of candidates) {
    try {
      const res = await fetch(c, { method: 'HEAD' });
      console.log(`Probe ${res.status}: ${c}`);
      if (res.ok) {
        const fname = path.basename(c);
        await fetchAndSave(c, path.join(normasDir, fname));
      }
    } catch (e: any) {
      console.log(`Probe ERR: ${c} - ${e.message}`);
    }
  }
}

main().catch(console.error);
