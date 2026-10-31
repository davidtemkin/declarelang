export function money(n: number): string { return '$' + (n / 100).toFixed(2) }
export function day(s: string): string { if (!s) return ''; return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(s)).replace(/,/g, '') }
export function time(s: string): string { if (!s) return ''; const h = Number(s.slice(11,13)); return `${h%12 || 12}:${s.slice(14,16)}${h<12?'am':'pm'}` }
export function brand(s: string): string { const n=s.replace(/\D/g,''); if (/^3[47]/.test(n)) return 'American Express'; if (/^4/.test(n)) return 'Visa'; if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard'; if (/^6/.test(n)) return 'Discover'; return 'Card' }
export function grouped(s: string): string { const n=s.replace(/\D/g,'').slice(0,19); return brand(n)==='American Express' ? [n.slice(0,4),n.slice(4,10),n.slice(10,15)].filter(Boolean).join(' ') : n.replace(/(.{4})/g,'$1 ').trim() }
export function cardError(s: string): string { const n=s.replace(/\D/g,''); let sum=0; for(let i=n.length-1;i>=0;i--){ let v=Number(n[i]); if((n.length-1-i)%2){v*=2;if(v>9)v-=9}sum+=v }return n.length>=13 && n.length<=19 && !/^0+$/.test(n) && sum%10===0 ? '' : 'Enter a valid card number.' }
export function expiryError(s: string): string { const p=s.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);if(!p)return 'Use MM/YY.'; const m=+p[1], y=+p[2]+(p[2].length===2?2000:0); const now=new Date();return m>=1&&m<=12&&new Date(y,m,1)>now?'':'Enter a future expiry month.' }
export function postalError(s: string,c: string): string { const re=c==='US'?/^\d{5}(-\d{4})?$/:c==='CA'?/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i:/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;return re.test(s.trim())?'':'Enter a valid postal code for your country.' }
export function expired(m: number,y: number): boolean {return new Date(y,m,1)<=new Date()}
import QRCode from 'qrcode/lib/browser.js'
export function ticketQR(code: string): string {
 if(!code)return '';
 const qr=QRCode.create(code,{errorCorrectionLevel:'M'}), size=qr.modules.size;
 let cells='';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(qr.modules.get(y,x))cells+=`M${x+4},${y+4}h1v1h-1z`;
 return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${size+8}" height="${size+8}" viewBox="0 0 ${size+8} ${size+8}"><rect width="100%" height="100%" fill="white"/><path d="${cells}" fill="black"/></svg>`)
}
