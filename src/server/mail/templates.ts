import { formatPrice } from "@/shared/lib/format";

/**
 * Templates d'e-mails transactionnels (FR) — reçu de commande et avis de
 * remboursement. Fonctions PURES : entrée typée → `{ subject, text, html }`.
 * Aucune dépendance au transport, testables sans réseau.
 *
 * Règles :
 * - Tout texte fourni par l'utilisateur/le catalogue est échappé en HTML.
 * - Le texte brut est toujours produit (clients mail sans HTML, accessibilité).
 * - Les montants viennent de la base (centimes) et sont formatés via `formatPrice`.
 */

export interface ReceiptLine {
  title: string;
  author?: string | null;
  priceCents: number;
}

export interface ReceiptInput {
  orderId: string;
  /** Prénom ou e-mail de l'acheteur (affiché dans la salutation). */
  customerName?: string | null;
  currency: string;
  totalCents: number;
  lines: ReceiptLine[];
  /** URL absolue de la bibliothèque (ex. `${BETTER_AUTH_URL}/library`). */
  libraryUrl: string;
  /** Date de paiement (défaut : maintenant). */
  paidAt?: Date;
}

export interface RefundInput {
  orderId: string;
  customerName?: string | null;
  currency: string;
  /** Montant remboursé (peut être partiel). */
  amountCents: number;
  /** Total initial de la commande (pour la mention « sur X »). */
  orderTotalCents: number;
  /** Titres concernés (accès révoqué). */
  titles: string[];
  /** URL absolue de la page commandes. */
  ordersUrl: string;
  refundedAt?: Date;
}

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

function greeting(name: string | null | undefined): string {
  return name && name.trim() ? `Bonjour ${name.trim()},` : "Bonjour,";
}

/** Référence courte lisible : 8 premiers caractères de l'UUID, en majuscules. */
export function shortOrderRef(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function layout(title: string, bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="fr"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:24px;background:#f6f6f4;font-family:Georgia,serif;color:#1c1c1a">',
    '<div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e5e5e0">',
    '<p style="margin:0 0 24px;font-size:20px;letter-spacing:.04em">Biblio</p>',
    bodyHtml,
    '<hr style="border:0;border-top:1px solid #e5e5e0;margin:32px 0 16px">',
    '<p style="font-size:12px;color:#6b6b66;margin:0">Biblio — librairie numérique. ',
    "Cet e-mail est envoyé automatiquement à la suite d'une opération sur votre compte ; ",
    "il ne s'agit pas d'une prospection commerciale.</p>",
    "</div></body></html>",
  ].join("");
}

/** Reçu envoyé lorsqu'une commande passe à `paid` (après fulfillment). */
export function renderReceipt(input: ReceiptInput): RenderedMail {
  const ref = shortOrderRef(input.orderId);
  const when = dateFmt.format(input.paidAt ?? new Date());
  const total = formatPrice(input.totalCents, input.currency);
  const subject = `Votre reçu Biblio — commande ${ref}`;

  const textLines = input.lines.map(
    (l) =>
      `  - ${l.title}${l.author ? ` (${l.author})` : ""} … ${formatPrice(l.priceCents, input.currency)}`,
  );
  const text = [
    greeting(input.customerName),
    "",
    `Merci pour votre achat. Votre commande ${ref} a été payée le ${when} (UTC).`,
    "",
    ...textLines,
    "",
    `Total : ${total}`,
    "",
    `Vos livres sont disponibles immédiatement dans votre bibliothèque : ${input.libraryUrl}`,
    "",
    "Les fichiers sont fournis sans DRM, pour un usage personnel (voir la page /legal).",
    "",
    `Référence complète : ${input.orderId}`,
  ].join("\n");

  const rows = input.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(l.title)}` +
        (l.author
          ? `<br><span style="color:#6b6b66;font-size:13px">${escapeHtml(l.author)}</span>`
          : "") +
        `</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${escapeHtml(
          formatPrice(l.priceCents, input.currency),
        )}</td></tr>`,
    )
    .join("");

  const html = layout(
    subject,
    `<p>${escapeHtml(greeting(input.customerName))}</p>` +
      `<p>Merci pour votre achat. Votre commande <strong>${ref}</strong> a été payée le ${escapeHtml(when)} (UTC).</p>` +
      `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}` +
      `<tr><td style="padding:10px 0;font-weight:bold">Total</td><td style="padding:10px 0;text-align:right;font-weight:bold">${escapeHtml(total)}</td></tr></table>` +
      `<p><a href="${escapeHtml(input.libraryUrl)}" style="display:inline-block;padding:10px 18px;background:#1c1c1a;color:#fff;text-decoration:none">Ouvrir ma bibliothèque</a></p>` +
      `<p style="font-size:13px;color:#6b6b66">Fichiers sans DRM, usage personnel (voir la page /legal). Référence complète : ${escapeHtml(input.orderId)}</p>`,
  );

  return { subject, text, html };
}

/** Avis envoyé lorsqu'un remboursement est CONFIRMÉ par Stripe (`refund.updated` → succeeded). */
export function renderRefundNotice(input: RefundInput): RenderedMail {
  const ref = shortOrderRef(input.orderId);
  const when = dateFmt.format(input.refundedAt ?? new Date());
  const amount = formatPrice(input.amountCents, input.currency);
  const partial = input.amountCents < input.orderTotalCents;
  const subject = partial
    ? `Remboursement partiel — commande ${ref}`
    : `Remboursement effectué — commande ${ref}`;

  const scope = partial
    ? `Un remboursement partiel de ${amount} (sur ${formatPrice(input.orderTotalCents, input.currency)}) a été effectué`
    : `Le remboursement intégral de ${amount} a été effectué`;

  const text = [
    greeting(input.customerName),
    "",
    `${scope} le ${when} (UTC) pour votre commande ${ref}.`,
    "",
    input.titles.length
      ? "L'accès aux titres suivants est retiré de votre bibliothèque :"
      : "Aucun titre n'est retiré de votre bibliothèque.",
    ...input.titles.map((t) => `  - ${t}`),
    "",
    "Le crédit apparaît sur votre moyen de paiement sous 5 à 10 jours ouvrés selon votre banque.",
    "",
    `Historique de vos commandes : ${input.ordersUrl}`,
    "",
    `Référence complète : ${input.orderId}`,
  ].join("\n");

  const list = input.titles.length
    ? `<ul>${input.titles.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : "";

  const html = layout(
    subject,
    `<p>${escapeHtml(greeting(input.customerName))}</p>` +
      `<p>${escapeHtml(scope)} le ${escapeHtml(when)} (UTC) pour votre commande <strong>${ref}</strong>.</p>` +
      `<p>${
        input.titles.length
          ? "L'accès aux titres suivants est retiré de votre bibliothèque :"
          : "Aucun titre n'est retiré de votre bibliothèque."
      }</p>${list}` +
      `<p>Le crédit apparaît sur votre moyen de paiement sous 5 à 10 jours ouvrés selon votre banque.</p>` +
      `<p><a href="${escapeHtml(input.ordersUrl)}">Voir mes commandes</a></p>` +
      `<p style="font-size:13px;color:#6b6b66">Référence complète : ${escapeHtml(input.orderId)}</p>`,
  );

  return { subject, text, html };
}
