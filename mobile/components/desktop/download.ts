// Saves text as a file: the browser download of a Blob, which the desktop shell
// turns into a Save as dialog. Nothing is uploaded; the text never leaves the
// page. A CSV gets a byte order mark so a spreadsheet reads it as UTF-8 (emoji
// and accents).
export function downloadText(filename: string, text: string, mime: string): void {
  const body = mime.startsWith('text/csv') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

export function dayStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
