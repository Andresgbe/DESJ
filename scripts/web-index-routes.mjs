// Después de `expo export -p web`: EAS Hosting sirve /yo/ desde yo/index.html, pero /yo (sin barra) da 404.
// Por cada carpeta con index.html se copia también como <carpeta>.html, así recargar /yo o /modulos funciona.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory() || name.startsWith('_')) continue;
    const index = path.join(full, 'index.html');
    const flat = `${full}.html`;
    if (existsSync(index) && !existsSync(flat)) copyFileSync(index, flat);
    walk(full);
  }
}

walk(path.resolve(process.argv[2] ?? 'dist'));
