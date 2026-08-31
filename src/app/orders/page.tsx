import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/authentication/lib/session";
import { viewOrders } from "@/features/orders/application/order-service";
import { orderStatusStyle } from "@/features/orders/domain/order-status";
import { formatPrice } from "@/shared/lib/format";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Page « Mes commandes » (RSC) : historique des achats de l'utilisateur connecté.
 * Les statuts reflètent le webhook Stripe (pending → paid → fulfilled…).
 */
export default async function OrdersPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in?next=/orders");
  }

  const orders = await viewOrders(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Mes commandes</h1>
      <p className="mt-1 text-neutral-600">Historique de vos achats et statuts de paiement.</p>

      {orders.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-lg text-neutral-500">Aucune commande pour le moment.</p>
          <p className="mt-1 text-sm text-neutral-400">
            Dès qu&apos;un achat est validé, il apparaîtra ici.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Explorer le catalogue
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-xl border border-neutral-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-neutral-500">Commande</p>
                  <p className="font-mono text-xs text-neutral-400">{order.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${orderStatusStyle(order.status)}`}
                  >
                    {order.statusLabel}
                  </span>
                  <span className="text-sm font-semibold text-neutral-900">
                    {formatPrice(order.totalInCents, order.currency)}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-sm text-neutral-500">
                {formatDate(order.createdAt)}
                {order.paidAt ? ` · payée le ${formatDate(order.paidAt)}` : ""}
              </p>

              <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
                {order.items.map((item) => (
                  <li key={item.productId} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{item.title}</p>
                      <p className="text-xs text-neutral-500">
                        {item.quantity} × {formatPrice(item.priceInCents, item.currency)}
                      </p>
                    </div>
                    <span className="text-sm text-neutral-700">
                      {formatPrice(item.lineTotalInCents, item.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
