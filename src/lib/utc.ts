export function formatUtc(value: string) {
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
