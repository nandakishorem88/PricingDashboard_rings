// Indian-rupee + quantity formatters.

export function rs(n: number, dp: number = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(dp)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(dp)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function rsExact(n: number, dp: number = 3): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function qty(n: number): string {
  if (!n) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString();
}

export function pct(n: number, dp: number = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(dp)}%`;
}
