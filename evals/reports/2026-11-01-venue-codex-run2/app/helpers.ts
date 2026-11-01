import QRCode from 'qrcode';
export function money(c: number): string { return '$' + (c / 100).toFixed(2); }
export function day(s: string): string { return s ? new Intl.DateTimeFormat('en-GB', {weekday:'short',day:'numeric',month:'short'}).format(new Date(s)).replace(',', '') : ''; }
export function hour(s: string): string { if (!s) return ''; const h = Number(s.slice(11,13)); return `${h % 12 || 12}:${s.slice(14,16)}${h >= 12 ? 'pm' : 'am'}`; }
export function brand(n: string): string { const s = n.replace(/\D/g,''); if (/^3[47]/.test(s)) return 'American Express'; if (/^4/.test(s)) return 'Visa'; if (/^(5[1-5]|2[2-7])/.test(s)) return 'Mastercard'; if (/^6/.test(s)) return 'Discover'; return 'Card'; }
export function grouped(n: string): string { const s = n.replace(/\D/g,'').slice(0,19); return brand(s) === 'American Express' ? [s.slice(0,4),s.slice(4,10),s.slice(10,15)].filter(Boolean).join(' ') : (s.match(/.{1,4}/g) || []).join(' '); }
export function cardError(n: string): string { const s = n.replace(/\s/g,''); if (!/^\d{13,19}$/.test(s)) return 'Enter a valid card number.'; let sum=0; for(let i=s.length-1,j=0;i>=0;i--,j++){let v=Number(s[i]); if(j%2){v*=2;if(v>9)v-=9;}sum+=v;} return sum%10 ? 'Check your card number.' : ''; }
export function expired(m: number,y: number): boolean { const d=new Date(); return m<1||m>12||y<d.getFullYear()||(y===d.getFullYear()&&m<d.getMonth()+1); }
export function expiryParts(s: string): number[] { const a=s.split(/\s*\/\s*/); return [Number(a[0]),Number(a[1])+(a[1]?.length===2?2000:0)]; }
export function expiryError(s: string): string { if(!/^\d{1,2}\s*\/\s*\d{2}(\d{2})?$/.test(s))return 'Use MM / YY.'; const [m,y]=expiryParts(s); if(m<1||m>12)return 'Enter a month from 01 to 12.'; return expired(m,y)?'This card has expired.':''; }
export function postalError(s: string,c: string): string { const tests: Record<string,RegExp>={US:/^\d{5}(-\d{4})?$/,CA:/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,GB:/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i}; return tests[c]?.test(s.trim())?'':'Enter a valid postal code for your country.'; }
export function emailError(s: string): string { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?'':'Enter a valid email address.'; }
export function qr(s: string): { size:number; data:number[] } { const m=QRCode.create(s||'VENUE',{errorCorrectionLevel:'M'}).modules;return {size:m.size,data:Array.from(m.data)}; }
