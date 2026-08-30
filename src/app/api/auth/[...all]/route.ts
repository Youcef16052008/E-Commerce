import { auth } from "@/features/authentication/lib/auth";

/**
 * Route handler de Better Auth.
 * `handler` est une fonction `(request) => Response` : on expose GET et POST
 * en la déléguant aux méthodes HTTP attendues.
 */
export function GET(request: Request) {
  return auth.handler(request);
}

export function POST(request: Request) {
  return auth.handler(request);
}
