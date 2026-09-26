import Link from "next/link";
import { SignUpForm } from "@/features/authentication/ui/sign-up-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold">Créer un compte</h1>
      <p className="mt-2 text-neutral-600">
        Un compte vous permet de retrouver vos achats à tout moment.
      </p>
      <SignUpForm />
      <p className="mt-6 text-xs text-neutral-500">
        En créant un compte, vous acceptez les{" "}
        <Link href="/legal" className="underline hover:text-neutral-900">
          conditions d&apos;utilisation et la politique de confidentialité
        </Link>
        . Vous pourrez exporter ou supprimer vos données à tout moment depuis votre compte.
      </p>
    </main>
  );
}
