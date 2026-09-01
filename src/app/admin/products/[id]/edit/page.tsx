import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminProduct } from "@/features/admin/application/admin-product-service";
import { ProductForm } from "@/features/admin/ui/product-form";

export const metadata: Metadata = {
  title: "Modifier le produit · Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) notFound();

  const priceUsd = (product.priceInCents / 100).toFixed(2);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Modifier le produit</h1>
      <p className="mt-1 text-neutral-600">
        {product.title} · <span className="font-mono text-sm">{product.slug}</span>
      </p>
      <ProductForm
        mode="edit"
        productId={product.id}
        preservedFileUrl={product.fileUrl}
        initial={{
          title: product.title,
          author: product.author,
          description: product.description ?? "",
          genre: product.genre ?? "",
          language: product.language ?? "fr",
          format: product.format as "epub" | "pdf",
          priceUsd,
          coverUrl: product.coverUrl?.startsWith("http") ? product.coverUrl : "",
          fileUrl: product.fileUrl?.startsWith("http") ? product.fileUrl : "",
          published: product.published,
          slug: product.slug,
        }}
      />
    </main>
  );
}
