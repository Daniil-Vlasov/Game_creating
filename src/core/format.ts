/** Подстановка {v} {n} {g} {t} … в строку из strings.json. Неизвестные плейсхолдеры остаются как есть. */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
