import { redirect } from "next/navigation";
import Link from "next/link";
import type Stripe from "stripe";
import { getStripe } from "@/server/payments/stripe";
import { getSessionUser } from "@/features/authentication/lib/session";

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

  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/auth/sign-in?next=${encodeURIComponent(`/checkout/success?session_id=${session_id}`)}`,
    );
  }

  let session: Stripe.Checkout.Session | null = null;
  try {
    session = await getStripe().checkout.sessions.retrieve(session_id);
  } catch {
    // Session introuvable / Stripe indisponible : message neutre, sans détail.
  }

  // Keep `redirect` outside the try/catch: Next.js implements it by throwing.
  // Never expose the state of another customer's Checkout session merely because
  // its id was pasted in a URL.
  if (session && session.metadata?.userId !== user.id) {
    redirect("/orders");
  }

  const isPaid = session?.payment_status === "paid";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700">
        {isPaid ? "Paiement confirmé" : "Paiement en cours de confirmation"}
      </div>
      <h1 className="mt-4 text-2xl font-semibold">Merci !</h1>
      <p className="mt-3 text-neutral-600">
        {isPaid
          ? "Votre paiement a été reçu. Nous finalisons l’ajout de vos ouvrages à votre bibliothèque."
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
