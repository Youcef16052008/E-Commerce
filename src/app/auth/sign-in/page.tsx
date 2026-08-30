import { SignInForm } from "@/features/authentication/ui/sign-in-form";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold">Connexion</h1>
      <p className="mt-2 text-neutral-600">Accédez à votre bibliothèque et vos commandes.</p>
      <SignInForm />
    </main>
  );
}
