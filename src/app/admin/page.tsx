import Link from "next/link";
import type { Metadata } from "next";
import { viewAdminStats } from "@/features/admin/application/admin-stats-service";
import { ADMIN_ORDER_STATUSES } from "@/features/admin/domain/admin-stats-types";
import { orderStatusStyle } from "@/features/orders/domain/order-status";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

export const dynamic = "force-dynamic";

/**
 * Tableau de bord admin (Slice 8) : chiffres réels de la BDD.
 * - Cartes : produits, commandes (+ répartition par statut), revenu USD, clients.
 * - Dernières commandes (5) + top produits (5 par unités vendues).
 * - Revenu = commandes `paid` + `fulfilled` uniquement (règle métier domaine).
 */
export default async function AdminHomePage() {
  const stats = await viewAdminStats();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Tableau de bord</h1>
      <p className="mt-1 text-neutral-600">
        Vue d&apos;ensemble du catalogue, des ventes et des clients — chiffres issus de la base de
        données.
      </p>

      {/* Cartes chiffres */}
      <section aria-label="Chiffres clés" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Produits</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {stats.productsTotal}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {stats.productsPublished} publiés · {stats.productsDraft} brouillon
            {stats.productsDraft > 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Commandes</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {stats.ordersTotal}
          </p>
          <ul className="mt-2 space-y-0.5 text-sm">
            {ADMIN_ORDER_STATUSES.map((status) => (
              <li key={status} className="flex items-center justify-between gap-2">
                <span className="text-neutral-600">{stats.ordersByStatusLabel[status]}</span>
                <span className="tabular-nums font-medium">{stats.ordersByStatus[status]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Revenu (USD)</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {stats.revenueFormatted}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {stats.paidOrdersCount} commande{stats.paidOrdersCount > 1 ? "s" : ""} payée
            {stats.paidOrdersCount > 1 ? "s" : ""} ou livrée
            {stats.paidOrdersCount > 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-neutral-500">Clients</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
            {stats.customersTotal}
          </p>
          <p className="mt-1 text-sm text-neutral-600">comptes clients enregistrés</p>
        </div>
      </section>

      {/* Dernières commandes + top produits */}
      <section aria-label="Activité récente" className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Dernières commandes</h2>
          </div>
          {stats.recentOrders.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-neutral-500">Aucune commande pour le moment.</p>
              <p className="mt-1 text-sm text-neutral-500">
                Elles apparaîtront ici dès la première vente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 text-left text-sm">
                <caption className="sr-only">
                  Cinq dernières commandes avec client, montant et statut
                </caption>
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Client
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">
                      Total
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {stats.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{order.userName}</div>
                        <div className="text-xs text-neutral-500">{order.userEmail}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-neutral-600">
                        {order.dateLabel}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums font-medium">
                        {order.totalFormatted}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${orderStatusStyle(order.status)}`}
                        >
                          {order.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-neutral-200 px-5 py-3">
            <Link
              href="/admin/orders"
              className="text-sm font-medium text-neutral-700 underline-offset-2 hover:underline"
            >
              Voir toutes les commandes →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Meilleures ventes</h2>
            <p className="text-xs text-neutral-500">
              Par unités vendues (commandes payées ou livrées)
            </p>
          </div>
          {stats.topProducts.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-neutral-500">Aucune vente enregistrée pour le moment.</p>
              <p className="mt-1 text-sm text-neutral-500">
                Le classement apparaîtra après les premières commandes payées.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-neutral-100">
              {stats.topProducts.map((product, index) => (
                <li key={product.productId} className="flex items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.title}</p>
                    <p className="text-xs text-neutral-500">
                      {product.unitsSold} unité{product.unitsSold > 1 ? "s" : ""} vendue
                      {product.unitsSold > 1 ? "s" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="border-t border-neutral-200 px-5 py-3">
            <Link
              href="/admin/products"
              className="text-sm font-medium text-neutral-700 underline-offset-2 hover:underline"
            >
              Gérer le catalogue →
            </Link>
          </div>
        </div>
      </section>

      {/* Navigation vers les pages de gestion */}
      <section aria-label="Gestion" className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/products"
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold">Produits</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Créer, modifier, publier ou supprimer des ouvrages du catalogue.
          </p>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-400 hover:shadow"
        >
          <h2 className="text-lg font-semibold">Commandes</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Consulter toutes les commandes et mettre à jour leur statut.
          </p>
        </Link>
      </section>
    </main>
  );
}
