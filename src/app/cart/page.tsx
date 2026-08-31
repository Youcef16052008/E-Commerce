import Link from "next/link";
import { redirect } from "next/navigation";
import { viewCart } from "@/features/cart/application/cart-service";
import { getSessionUser } from "@/features/authentication/lib/session";
import { CartLineActions } from "@/features/cart/ui/cart-line-actions";
import { formatPrice } from "@/shared/lib/format";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in?next=/cart");
  }

  const cart = await viewCart(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Mon panier</h1>

      {cart.items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-lg text-neutral-500">Votre panier est vide.</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Explorer le catalogue
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
            {cart.items.map((item) => (
              <li key={item.productId} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-16 w-12 items-center justify-center rounded bg-neutral-100 text-xl">
                    📕
                  </div>
                  <div>
                    <Link
                      href={`/products/${item.slug}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm text-neutral-600">{item.author}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {formatPrice(item.unitPriceInCents, item.currency)} ·{" "}
                      {item.format?.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-semibold">
                    {formatPrice(item.lineTotalInCents, item.currency)}
                  </span>
                  <CartLineActions productId={item.productId} quantity={item.quantity} />
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{formatPrice(cart.totalInCents, cart.currency)}</span>
            </div>
            <button
              disabled
              aria-disabled="true"
              className="mt-4 w-full cursor-not-allowed rounded-full bg-neutral-300 px-6 py-3 font-medium text-white"
            >
              Passer au paiement (bientôt)
            </button>
            <p className="mt-3 text-center text-xs text-neutral-500">
              L&apos;encaissement Stripe sera activé à la prochaine étape.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
