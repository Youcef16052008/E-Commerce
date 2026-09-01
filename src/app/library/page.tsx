import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/authentication/lib/session";
import { viewLibrary } from "@/features/library/application/library-service";
import { DownloadButton } from "@/features/library/ui/download-button";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/sign-in?next=/library");
  }

  const items = await viewLibrary(user.id);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Ma bibliothèque</h1>
      <p className="mt-1 text-neutral-600">
        Retrouvez et téléchargez les ouvrages que vous avez achetés.
      </p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <p className="text-lg text-neutral-500">Votre bibliothèque est vide.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Une fois un achat confirmé, vos ouvrages apparaîtront ici.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Explorer le catalogue
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex flex-col rounded-xl border border-neutral-200 p-4"
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100">
                {item.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.coverUrl}
                    alt={`Couverture de ${item.title}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-full w-full items-center justify-center text-3xl text-neutral-400"
                  >
                    📕
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-1 flex-col">
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {item.genre ?? "Livre"} · {item.format?.toUpperCase()}
                </p>
                {/* h2 : chaque ouvrage de la bibliothèque est une section de
                    rang 2 (après le h1 de la page) — ordre séquentiel (a11y). */}
                <h2 className="mt-1">
                  <Link href={`/products/${item.slug}`} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                </h2>
                <p className="text-sm text-neutral-600">{item.author}</p>
                <div className="mt-3">
                  <DownloadButton productId={item.productId} hasFile={Boolean(item.fileUrl)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
