/**
 * Rôles applicatifs. Le rôle est stocké sur l'utilisateur (auth-schema) sous forme
 * de chaîne, mais est exposé côté applicatif via ce type restreint pour éviter
 * toute valeur arbitraire en dehors de `customer` / `admin`.
 */
export type UserRole = "customer" | "admin";

export const ROLE_CUSTOMER: UserRole = "customer";
export const ROLE_ADMIN: UserRole = "admin";

export function isAdmin(role: string | null | undefined): boolean {
  return role === ROLE_ADMIN;
}
