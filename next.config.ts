import type { NextConfig } from "next";

/**
 * Headers de sécurité appliqués à toutes les routes (registre de durcissement H-5).
 * - X-Frame-Options: DENY — jamais embarquée dans un frame (anti-clickjacking).
 * - X-Content-Type-Options: nosniff — pas de MIME-sniffing.
 * - Referrer-Policy: no-referrer — les URLs ne fuient jamais vers l'extérieur.
 * - Strict-Transport-Security — HTTPS uniquement (effectif dès que le domaine
 *   est servi en TLS, ex. Vercel ; ignoré sur http local).
 * - Permissions-Policy — aucune API sensible (caméra/mic/géo/ paiement) n'est
 *   utilisée par l'app : on les désactive explicitement.
 * - Cross-Origin-Resource-Policy: same-origin — nos réponses ne sont jamais
 *   consommées cross-origin.
 * Vérifiés par tests/unit/next-config.test.ts (valeurs) et en e2e (headers
 * réellement servis).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
