export function csvCell(value: unknown) {
  let text=String(value ?? '');
  // Prevent spreadsheet formula execution, including whitespace-prefixed formulas.
  if (/^[=+\-@]/.test(text.trimStart()) || /^[\t\r\n]/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function makeCsv(headers: string[],rows: unknown[][]) {
  return '\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
