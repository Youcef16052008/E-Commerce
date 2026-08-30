"use client";

import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { useRouter } from "next/navigation";

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.signUp.email({ name, email, password });
      if (res.error) {
        setError(res.error.message ?? "Inscription impossible.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Une erreur est survenue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <label className="block text-sm font-medium">
        Nom
        <input
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
      </label>
      <label className="block text-sm font-medium">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
      </label>
      <label className="block text-sm font-medium">
        Mot de passe
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
        />
        <span className="mt-1 block text-xs text-neutral-500">8 caractères minimum.</span>
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {loading ? "Inscription…" : "Créer mon compte"}
      </button>
      <p className="text-center text-sm text-neutral-600">
        Déjà inscrit ?{" "}
        <a href="/auth/sign-in" className="font-medium underline">
          Se connecter
        </a>
      </p>
    </form>
  );
}
