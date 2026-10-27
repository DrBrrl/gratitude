const parts = new Map<string, Intl.DateTimeFormat>();
export function dayInZone(value: Date | string, zone: string): string {
  let format=parts.get(zone);
  if (!format) {format=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});parts.set(zone,format);}
  const p=Object.fromEntries(format.formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${p.year.padStart(4,'0')}-${p.month}-${p.day}`;
}
export function civilDate(day: string) {
  const date=new Date(`${day}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(+date) || date.toISOString().slice(0,10)!==day || date.getUTCFullYear()<1) throw new Error('Invalid calendar date');
  return date;
}
export function validDay(day: unknown): day is string {try {return typeof day==='string' && !!civilDate(day);} catch {return false;}}
