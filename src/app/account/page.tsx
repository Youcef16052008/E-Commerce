import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/authentication/lib/session";
import { viewOrders } from "@/features/orders/application/order-service";
import { DeleteAccountForm } from "@/features/account/ui/delete-account-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mon compte" };

/**
 * Page « Mon compte » (RSC) : identité, export RGPD, suppression.
 * Les liens pointent vers des route handlers protégés par la session serveur.
 */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/sign-in?next=/account");

  const orders = await viewOrders(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Mon compte</h1>
      <p className="mt-1 text-neutral-600">Vos informations et vos droits sur vos données.</p>

      <section className="mt-8 rounded-xl border border-neutral-200 p-5">
        <h2 className="text-lg font-semibold">Identité</h2>
        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-neutral-500">Nom</dt>
          <dd>{user.name}</dd>
          <dt className="text-neutral-500">E-mail</dt>
          <dd>{user.email}</dd>
          <dt className="text-neutral-500">Commandes</dt>
          <dd>{orders.length}</dd>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 p-5">
        <h2 className="text-lg font-semibold">Exporter mes données</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Téléchargez un fichier JSON contenant votre profil, vos commandes, vos droits
          d&apos;accès, vos remboursements et vos sessions (droit d&apos;accès et de portabilité,
          art. 15 et 20 RGPD).
        </p>
        <a
          href="/api/me/export"
          download
          className="mt-4 inline-block rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Télécharger l&apos;export (JSON)
        </a>
      </section>

      <section className="mt-6 rounded-xl border border-red-200 bg-red-50/40 p-5">
        <h2 className="text-lg font-semibold text-red-800">Supprimer mon compte</h2>
        <DeleteAccountForm hasOrders={orders.length > 0} />
      </section>

      <p className="mt-8 text-xs text-neutral-500">
        Détails sur la conservation et vos droits :{" "}
        <Link href="/legal" className="underline hover:text-neutral-900">
          mentions légales &amp; confidentialité
        </Link>
        .
      </p>
    </main>
  );
}
