import Link from "next/link";

/**
 * Pagination (RSC). Construit des liens préservant les autres query params.
 */
export function Pagination({
  page,
  totalPages,
  buildPageUrl,
}: {
  page: number;
  totalPages: number;
  buildPageUrl: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const links = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);

  for (let p = start; p <= end; p++) {
    links.push(
      <Link
        key={p}
        href={buildPageUrl(p)}
        aria-current={p === page ? "page" : undefined}
        className={`rounded-lg px-3 py-1.5 text-sm ${
          p === page
            ? "bg-neutral-900 text-white"
            : "border border-neutral-300 hover:bg-neutral-100"
        }`}
      >
        {p}
      </Link>,
    );
  }

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 && (
        <Link
          href={buildPageUrl(page - 1)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Précédent
        </Link>
      )}
      {links}
      {page < totalPages && (
        <Link
          href={buildPageUrl(page + 1)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Suivant
        </Link>
      )}
    </nav>
  );
}
