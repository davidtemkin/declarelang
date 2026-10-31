export const money = (n) => `$${(n / 100).toFixed(2)}`;
export function brand(number) {
  const n = number.replace(/\D/g, "");
  return /^3[47]/.test(n)
    ? "amex"
    : /^4/.test(n)
      ? "visa"
      : /^(5[1-5]|2[2-7])/.test(n)
        ? "mastercard"
        : /^6/.test(n)
          ? "discover"
          : "";
}
export function formatCard(value) {
  const n = value.replace(/\D/g, "").slice(0, 19);
  return brand(n) === "amex"
    ? [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(" ")
    : n.match(/.{1,4}/g)?.join(" ") || "";
}
export function validCard(value) {
  const n = value.replace(/\D/g, "");
  if (!/^\d{13,19}$/.test(n)) return false;
  let sum = 0;
  [...n].reverse().forEach((c, i) => {
    let d = +c;
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  });
  return sum % 10 === 0;
}
export function expired(month, year) {
  const now = new Date();
  return (
    month < 1 ||
    month > 12 ||
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1)
  );
}
export function validate(form, savedBrand) {
  const e = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    e.email = "Enter a valid email address.";
  const kind = savedBrand || brand(form.number);
  if (!new RegExp(`^\\d{${kind === "amex" ? 4 : 3}}$`).test(form.cvc))
    e.cvc = `Enter the ${kind === "amex" ? 4 : 3}-digit security code.`;
  if (savedBrand) return e;
  if (!form.name.trim()) e.name = "Enter the name on your card.";
  if (!validCard(form.number)) e.number = "Enter a valid card number.";
  const [m, y] = form.expiry.split("/").map((s) => Number(s.trim()));
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(form.expiry) || expired(m, 2000 + y))
    e.expiry = "Enter a valid future expiry as MM / YY.";
  if (!form.line1.trim()) e.line1 = "Enter your billing street address.";
  if (!form.city.trim()) e.city = "Enter your city.";
  const patterns = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
    GB: /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/i,
  };
  if (!patterns[form.country]?.test(form.postalCode.trim()))
    e.postalCode = "Enter a valid postal code for your country.";
  return e;
}
