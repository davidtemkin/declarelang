// Shared helpers for the checker's scripts: what is free on the live service now.
export const API = "http://127.0.0.1:8350";

export async function freeSeats(perfId) {
  const r = await fetch(`${API}/api/performances/${perfId}/seats`);
  const m = await r.json();
  const out = {};
  for (const s of m.sections) {
    out[s.name] = [];
    for (const row of s.rows) for (const seat of row.seats)
      if (seat.status == "available") out[s.name].push({ id: seat.id, name: `${s.name}, row ${row.name}, seat ${seat.number}`, price: s.priceCents, fee: s.feeCents });
  }
  return out;
}

// the performance with the most seats left
export async function roomiest() {
  const p = await (await fetch(`${API}/api/production`)).json();
  return [...p.performances].sort((a, b) => b.seatsLeft - a.seatsLeft)[0];
}

export const money = (c) => "$" + (c / 100).toFixed(2);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function perfName(p) {
  const d = new Date(p.startsAt);
  let h = d.getHours(), m = d.getMinutes();
  const t = `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}, ${t}`;
}

export const read = (drive, path, attr) =>
  drive.page.evaluate(([p, a]) => { const v = window.__declare.find(p)?.[a]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, [path, attr]);
