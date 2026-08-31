import { redirect } from "next/navigation";
import Link from "next/link";
import { getStripe } from "@/server/payments/stripe";

export const dynamic = "force-dynamic";

/**
 * Page de retour après un paiement réussi.
 * NB : le droit d'accès (entitlement) est accordé par le WEBHOOK, pas par cette page.
 * Cette page ne fait qu'afficher le statut de la session (le véritable paiement est
 * confirmé côté serveur via le webhook signé). Le bouton "ma bibliothèque" sera
 * opérationnel dès que le webhook a délivré les droits.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) {
    redirect("/cart");
  }

  let status: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(session_id);
    status = session.payment_status;
  } catch {
    // session introuvable / clé absente → on affiche un message neutre
  }

  const isPaid = status === "paid";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700">
        {isPaid ? "Paiement confirmé" : "Paiement en cours de confirmation"}
      </div>
      <h1 className="mt-4 text-2xl font-semibold">Merci !</h1>
      <p className="mt-3 text-neutral-600">
        {isPaid
          ? "Votre commande est confirmée. Vos ouvrages apparaissent dans votre bibliothèque."
          : "Votre paiement est en cours de vérification par notre serveur. Cela ne prend qu'un instant."}
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/library"
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Ma bibliothèque
        </Link>
        <Link
          href="/products"
          className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Continuer mes achats
        </Link>
      </div>
    </main>
  );
}
