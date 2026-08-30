"use client";

import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client";

export function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:bg-neutral-100"
    >
      Se déconnecter
    </button>
  );
}
