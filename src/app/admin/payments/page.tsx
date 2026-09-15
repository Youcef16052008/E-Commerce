import type { Metadata } from "next";
import { viewPaymentExceptions } from "@/features/admin/application/payment-exceptions-service";
import {
  PAYMENT_EXCEPTION_KINDS,
  PAYMENT_EXCEPTION_LABELS,
} from "@/features/admin/domain/payment-exceptions";
import { orderStatusLabel, orderStatusStyle } from "@/features/orders/domain/order-status";

export const metadata: Metadata = {
  title: "Paiements à examiner · Admin",
};

export const dynamic = "force-dynamic";

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}

/**
 * The page is deliberately read-only. It makes discrepancies visible without
 * offering a dangerous “mark paid/refunded” action outside Stripe.
 */
export default async function AdminPaymentExceptionsPage() {
  const report = await viewPaymentExceptions();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Paiements à examiner</h1>
      <p className="mt-1 max-w-3xl text-neutral-600">
        Contrôle de cohérence entre les commandes, les identifiants Stripe et les droits d’accès.
        Cette liste est en lecture seule : ne marquez jamais une commande payée ou remboursée sans
        la confirmation Stripe correspondante.
      </p>

      <section
        aria-label="Résumé des exceptions"
        className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {PAYMENT_EXCEPTION_KINDS.map((kind) => (
          <div key={kind} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-neutral-600">{PAYMENT_EXCEPTION_LABELS[kind]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{report.counts[kind]}</p>
          </div>
        ))}
      </section>

      {report.total === 0 ? (
        <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center">
          <h2 className="text-lg font-semibold text-emerald-900">Aucun écart interne détecté</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Contrôle généré le{" "}
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
              report.generatedAt,
            )}
            . Continuez la réconciliation périodique avec Stripe avant toute clôture comptable.
          </p>
        </section>
      ) : (
        <section className="mt-8 overflow-x-auto rounded-xl border border-amber-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
            <caption className="sr-only">
              Exceptions de paiement et de délivrance à examiner
            </caption>
            <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-900">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Écart
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Commande
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Client
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Statut
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Montant
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Détail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {report.items.map((issue) => (
                <tr key={`${issue.kind}-${issue.orderId}-${issue.productId ?? "order"}`}>
                  <td className="px-4 py-3 font-medium text-amber-900">{issue.label}</td>
                  <td
                    className="px-4 py-3 font-mono text-xs text-neutral-600"
                    title={issue.orderId}
                  >
                    {shortId(issue.orderId)}
                    <div className="mt-0.5 font-sans text-xs text-neutral-500">
                      {issue.createdAtLabel}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{issue.userName}</div>
                    <div className="text-xs text-neutral-500">{issue.userEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${orderStatusStyle(issue.orderStatus)}`}
                    >
                      {orderStatusLabel(issue.orderStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {issue.totalFormatted}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {issue.productTitle && <div>Droit manquant : {issue.productTitle}</div>}
                    {issue.checkoutExpiresAtLabel && (
                      <div>Expiration Checkout : {issue.checkoutExpiresAtLabel}</div>
                    )}
                    {!issue.productTitle && !issue.checkoutExpiresAtLabel && (
                      <div>Vérifier l’objet Stripe lié à cette commande.</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
