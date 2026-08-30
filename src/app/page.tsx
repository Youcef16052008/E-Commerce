export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-4 rounded-full border border-neutral-300 px-3 py-1 text-xs uppercase tracking-widest text-neutral-500">
        Librairie numérique
      </span>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Biblio</h1>
      <p className="mt-4 max-w-xl text-lg text-neutral-600">
        Achetez vos e-books et contenus numériques, retrouvez-les à tout moment dans votre
        bibliothèque personnelle.
      </p>
      <div className="mt-8 flex gap-3">
        <a
          href="/products"
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Explorer le catalogue
        </a>
        <a
          href="/auth/sign-in"
          className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Se connecter
        </a>
      </div>
    </main>
  );
}
