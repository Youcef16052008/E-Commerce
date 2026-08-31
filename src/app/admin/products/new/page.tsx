import type { Metadata } from "next";
import { ProductForm } from "@/features/admin/ui/product-form";

export const metadata: Metadata = {
  title: "Nouveau produit · Admin",
};

export default function AdminNewProductPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Nouveau produit</h1>
      <p className="mt-1 text-neutral-600">
        Les champs obligatoires sont marqués d&apos;un astérisque. Le slug est généré
        automatiquement s&apos;il est laissé vide.
      </p>
      <ProductForm mode="create" />
    </main>
  );
}
