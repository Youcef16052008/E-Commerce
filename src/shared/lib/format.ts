/**
 * Formatage monétaire. Les montants sont stockés en centimes (entiers).
 */
export function formatPrice(priceInCents: number, currency = "eur"): string {
  const amount = priceInCents / 100;
  const locale = currency === "eur" || currency === "EUR" ? "fr-FR" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount);
}
