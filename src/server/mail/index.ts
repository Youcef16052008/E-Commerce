/**
 * `server/mail` — e-mail transactionnel (D-05, ADR-010).
 *
 * Point d'entrée unique : `sendReceipt` / `sendRefundNotice`. Le fournisseur
 * est choisi par `MAIL_PROVIDER` (console | resend | postmark | ses) ; en
 * l'absence de configuration, le mode `console` journalise sans envoyer, si
 * bien que l'appelant n'a JAMAIS à tester la configuration.
 *
 * Contrat pour les appelants (checkout / refunds) :
 * - l'envoi n'est PAS dans la transaction métier : on appelle après commit,
 *   et l'échec est journalisé, jamais propagé (`safe*` ci-dessous) — un e-mail
 *   perdu ne doit pas faire rejouer un webhook Stripe ni annuler un fulfillment.
 * - le `tag` (`receipt:<orderId>`, `refund:<orderId>:<amount>`) sert d'idempotence
 *   côté fournisseur quand celui-ci la supporte.
 */

import {
  createMailProvider,
  getMailConfig,
  isMailConfigured,
  type MailMessage,
  type MailProvider,
  type MailSendResult,
} from "./providers";
import {
  renderReceipt,
  renderRefundNotice,
  type ReceiptInput,
  type RefundInput,
  type RenderedMail,
} from "./templates";

export type { MailMessage, MailProvider, MailSendResult, ReceiptInput, RefundInput, RenderedMail };
export { getMailConfig, isMailConfigured, renderReceipt, renderRefundNotice };

let cached: MailProvider | null = null;

/** Provider partagé (paresseux). `resetMailProvider()` pour les tests. */
export function getMailProvider(): MailProvider {
  cached ??= createMailProvider();
  return cached;
}

export function resetMailProvider(provider: MailProvider | null = null): void {
  cached = provider;
}

/** Base publique du site pour les liens absolus (sans slash final). */
export function getPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw =
    env.BETTER_AUTH_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

async function deliver(
  to: string,
  rendered: RenderedMail,
  tag: string,
  provider: MailProvider = getMailProvider(),
): Promise<MailSendResult> {
  const { from } = getMailConfig();
  return provider.send({ to, ...rendered, tag }, from);
}

/** Envoie le reçu ; lève en cas d'échec du fournisseur (voir `safeSendReceipt`). */
export function sendReceipt(
  to: string,
  input: ReceiptInput,
  provider?: MailProvider,
): Promise<MailSendResult> {
  return deliver(to, renderReceipt(input), `receipt:${input.orderId}`, provider);
}

/** Envoie l'avis de remboursement ; lève en cas d'échec du fournisseur. */
export function sendRefundNotice(
  to: string,
  input: RefundInput,
  provider?: MailProvider,
): Promise<MailSendResult> {
  return deliver(
    to,
    renderRefundNotice(input),
    `refund:${input.orderId}:${input.amountCents}`,
    provider,
  );
}

function logMailFailure(kind: string, orderId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[mail] ${kind} non envoyé pour la commande ${orderId} : ${message}`);
}

/** Variante « best effort » : ne lève jamais, renvoie `null` en cas d'échec. */
export async function safeSendReceipt(
  to: string,
  input: ReceiptInput,
  provider?: MailProvider,
): Promise<MailSendResult | null> {
  try {
    return await sendReceipt(to, input, provider);
  } catch (err) {
    logMailFailure("reçu", input.orderId, err);
    return null;
  }
}

/** Variante « best effort » : ne lève jamais, renvoie `null` en cas d'échec. */
export async function safeSendRefundNotice(
  to: string,
  input: RefundInput,
  provider?: MailProvider,
): Promise<MailSendResult | null> {
  try {
    return await sendRefundNotice(to, input, provider);
  } catch (err) {
    logMailFailure("avis de remboursement", input.orderId, err);
    return null;
  }
}
