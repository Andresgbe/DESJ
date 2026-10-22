// Fechas de los módulos (exámenes, bitácoras): se escriben DD/MM/AAAA, se guardan YYYY-MM-DD y se
// muestran cortas ("14 mar 2023").
/** "14/03/2023", "14-3-2023" o "2023-03-14" → "2023-03-14". null si no es una fecha real o es futura. */
export function parseDate(text: string, now = new Date()) {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!parts) return null;
  const [y, m, d] = parts;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  if (date.getTime() > now.getTime()) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2023-03-14" → "14 mar 2023". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2023-03-14" → "14/03/2023" (para editar). */
export const toDmy = (iso: string) => iso.split('-').reverse().join('/');

/** Hace cuánto: "hace 3 años", "hace 2 meses", "este mes". */
export function since(iso: string, now = new Date()) {
  const [y, m] = iso.split('-').map(Number);
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (months <= 0) return 'este mes';
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}
