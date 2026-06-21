// Lightweight client-side CSV / printable report exporters — no deps.

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

export function exportToCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) {
    downloadBlob(filename, 'No data\n', 'text/csv;charset=utf-8;');
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const header = cols.map(csvEscape).join(',');
  const body = rows.map(r => cols.map(c => csvEscape(r[c])).join(',')).join('\n');
  downloadBlob(filename, `${header}\n${body}\n`, 'text/csv;charset=utf-8;');
}

/**
 * Generate a printable HTML report and trigger the browser's Save-as-PDF dialog.
 * No PDF library needed — leverages the browser's print pipeline.
 */
export function printReport({ title, subtitle, sections = [] }) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  const today = new Date().toLocaleDateString();

  const sectionsHtml = sections.map(s => {
    if (s.type === 'kpis') {
      return `
        <h2>${s.heading || 'Summary'}</h2>
        <div class="kpi-row">
          ${s.items.map(k => `
            <div class="kpi">
              <div class="kpi-label">${k.label}</div>
              <div class="kpi-value">${k.value}</div>
            </div>
          `).join('')}
        </div>`;
    }
    if (s.type === 'table') {
      const cols = s.columns;
      return `
        <h2>${s.heading || ''}</h2>
        <table>
          <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
          <tbody>
            ${s.rows.map(r => `<tr>${cols.map(c => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>`;
    }
    if (s.type === 'note') {
      return `<p class="note">${s.text}</p>`;
    }
    return '';
  }).join('');

  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Inter, system-ui, sans-serif; color: #0f172a; padding: 32px 40px; line-height: 1.5; }
  header { border-bottom: 3px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { color: #4f46e5; margin: 0 0 4px; font-size: 26px; }
  h2 { font-size: 16px; margin: 28px 0 10px; color: #312e81; }
  .meta { color: #64748b; font-size: 13px; }
  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
  .kpi { background: #f5f7ff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 12px; }
  .kpi-label { color: #6366f1; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
  .kpi-value { font-size: 18px; font-weight: 700; margin-top: 4px; color: #1e1b4b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #eef2ff; padding: 8px 10px; color: #312e81; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  .note { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 6px; font-size: 13px; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #94a3b8; font-size: 11px; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<header>
  <h1>${title}</h1>
  <div class="meta">${subtitle || ''} · Generated ${today}</div>
</header>
${sectionsHtml}
<footer>AI Business Advisor · Random Forest forecast · ${today}</footer>
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`);
  w.document.close();
}
