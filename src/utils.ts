export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function symbolFromStyle(style: string): string {
  const m = style.match(/image=([^;]+)/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].split('/').pop() || '').replace(/\.svg$/i, '');
  } catch {
    return (m[1].split('/').pop() || '').replace(/\.svg$/i, '');
  }
}
