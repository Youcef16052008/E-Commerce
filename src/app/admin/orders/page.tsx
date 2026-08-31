import type { Metadata } from "next";
import { viewAllOrders } from "@/features/admin/application/admin-order-service";
import { OrderStatusSelect } from "@/features/admin/ui/order-status-select";
import { formatPrice } from "@/shared/lib/format";
import { orderStatusStyle } from "@/features/orders/domain/order-status";

export const metadata: Metadata = {
  title: "Commandes · Admin",
};

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function truncateId(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export default async function AdminOrdersPage() {
  const orders = await viewAllOrders();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Commandes</h1>
      <p className="mt-1 text-neutral-600">
        {orders.length} commande{orders.length > 1 ? "s" : ""} au total
      </p>

      {orders.length === 0 ? (
        <div className="mt-12 rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-lg text-neutral-500">Aucune commande pour le moment.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Id</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Changer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-600" title={o.id}>
                    {truncateId(o.id)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.userName}</div>
                    <div className="text-xs text-neutral-500">{o.userEmail}</div>
                    <div className="text-xs text-neutral-400">
                      {o.itemCount} article{o.itemCount > 1 ? "s" : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {formatDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatPrice(o.totalInCents, o.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs ${orderStatusStyle(o.status)}`}
                    >
                      {o.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusSelect orderId={o.id} current={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
