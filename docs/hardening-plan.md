# Plan de durcissement — registre des problèmes & corrections

**Date : 2026-09-05.** **Statut : exécuté (2026-09-05) — blocs 1-4 corrigés et testés, poussés sur la PR #3. La porte d'entrée au déploiement (Slice 10) est levée.**

Ce document est le produit d'une revue de code « senior » effectuée **sur le code, pas sur
la documentation** : les chemins critiques (webhook, checkout, livraison d'entitlement,
téléchargement, auth, stockage) ont été relus ligne à ligne. Les claims « ✅ validé en réel »
de `project-state.md` n'ont pas été pris pour argent comptant — plusieurs ont été confirmés,
mais certains validaient le **chemin heureux dans un environnement long-lived (local)**,
pas le contrat de la plateforme cible (Vercel serverless).

Règle du document : chaque problème est **vérifié** (reproduit/lisible dans le code) ou
**inféré** (comportement de plateforme non reproductible sans deploy) — la distinction est
toujours faite.

## Résumé

| ID  | Problème                                                                                                | Sévérité    | Type                                          | Priorité          |
| --- | ------------------------------------------------------------------------------------------------------- | :---------- | --------------------------------------------- | :---------------- |
| H-1 | Webhook traité **après** la réponse (`setTimeout`) — paiements potentiellement perdus en serverless     | 🔴 critique | Vérifié (code) + inféré (comportement Vercel) | **P0**            |
| H-2 | Réutilisation de commande par `(userId, total)` — **mauvais entitlement délivré**                       | 🔴 critique | Vérifié (code, scénario démontrable)          | **P0**            |
| H-3 | Webhook sans vérification `payment_status` / `amount_total` — livraison possible sans paiement effectif | 🔴 haut     | Vérifié (code) ; sémantique Stripe documentée | **P0**            |
| H-4 | Pas de transaction autour de la délivrance — le commentaire dit qu'il y en a une                        | 🟠 haut     | Vérifié (code)                                | **P0** (avec H-1) |
| H-5 | Zéro header de sécurité — et l'architecture doc les revendique                                          | 🟠 moyen    | Vérifié (code)                                | **P1**            |
| H-6 | Remboursement sans révocation d'entitlement                                                             | 🟠 moyen    | Vérifié (code)                                | **P1**            |
| L-1 | Pas de machine à états des statuts de commande                                                          | 🟡 faible   | Vérifié (code)                                | P2                |
| L-2 | Invariant mono-devises non forcé au checkout                                                            | 🟡 faible   | Vérifié (code)                                | P2                |
| L-3 | `STRIPE_TAX_CODE` lu à l'import du module                                                               | 🟡 faible   | Vérifié (code)                                | P3                |
| L-4 | Comptes e2e non nettoyés dans la base de test                                                           | 🟡 faible   | Vérifié (code)                                | P3                |
| L-5 | Scores Lighthouse = sandbox, pas une preuve prod                                                        | 🟡 faible   | Vérifié (doc)                                 | refaire au deploy |

---

## H-1 — Webhook : traitement après réponse = perte de paiements sur serverless

**Code concerné** : `src/app/api/webhooks/stripe/route.ts:24-30`

```ts
setTimeout(() => {
  handleWebhook(event).catch((err) => { console.error(...); });
}, 0);

return NextResponse.json({ received: true });
```

**Cause racine** : l'hypothèse « réponse rapide + traitement en arrière-plan » est valable
pour un process Node **long-lived** (`next start`, dev), **pas** pour du serverless. Sur
Vercel, une fois la réponse retournée, la plateforme peut geler/réclamer l'instance ; les
promesses en vol ne sont suivies par rien et sont annulées à un moment arbitraire. Le
comportement est **non déterministe** : avec du trafic, l'instance est réchauffée par
d'autres requêtes et le `setTimeout` s'exécute ; en pointe basse de trafic, il disparaît
silencieusement. C'est le mode de défaut le plus piégeux : _le travail tourne parfois_.

**Sources** (comportement plateforme, vérifié par recherche le 2026-09-05) :

- Notes de terrain Vercel 2026 — « _The failure mode that cost me the most debugging time is
  not that the work never runs — it is that the work runs sometimes_ » :
  <https://dev.to/ahmed_mahmoud360/background-jobs-on-vercel-in-2026-field-notes-on-waituntil-queues-workflow-and-cron-1l6g>
- Stack Overflow — « Next.js serverless functions are not working unless I ping them » :
  « _all the background tasks are terminated once a response is returned_ » (locally they
  complete) : <https://stackoverflow.com/questions/76550326>
- Background operations on Next.js/Vercel — « _Vercel's serverless functions normally
  terminate the moment a response is sent. Any async work still running gets killed_ » :
  <https://www.buildwithmatija.com/blog/how-to-implement-payload-jobs-for-background-operations-in-next-js-on-vercel>

**Scénario d'échec concret** : Stripe envoie `checkout.session.completed` → la route répond
200 → le `setTimeout` ne s'exécute jamais (instance réclaimée) → **Stripe ne retente pas**
(il a reçu 2xx) → la commande reste `pending` indéfiniment, **aucun entitlement**, le client
a payé sans recevoir son livre. Aucun log (le `catch` ne tourne pas non plus).

**Pourquoi ce n'est pas détecté** :

- En local (`next start`) le process vit → le `setTimeout` tire → tout est vert.
- La CI (GitHub Actions) tourne aussi sur un process long-lived.
- Les tests d'intégration appellent `handleWebhook` **directement** (jamais via la route) →
  le contrat HTTP/serverless n'est testé nulle part.
- Le commentaire du code décrit l'intention (« Réponse 2xx immédiate ; le traitement lourd
  tourne en arrière-plan ») — c'est l'intention qui est fausse pour la cible, pas le code.

**Correction (recommandée, MVP)** : **traiter avant de répondre**. Le traitement =
~4 requêtes DB (marquer payée, entitlements, vider panier, enregistrer l'évènement) —
quelques dizaines de ms, bien dans la tolérance de Stripe (~5-10 s avant retry).

```ts
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const event = parseAndVerifyWebhook(rawBody, signature);
  if (event == null) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  try {
    const result = await handleWebhook(event); // ATOMIC (voir H-4)
    return NextResponse.json({ received: true, status: result.status });
  } catch (err) {
    console.error("[webhook] processing error", err);
    // 500 → Stripe RETENTE (idempotence H-4 protège du doublon).
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
```

**Options évaluées et écartées** :

- `after()` (Next 15.1+) / `waitUntil` (`@vercel/functions`) : prolongent la vie de la
  fonction après la réponse, mais c'est **best-effort sans retry** — inacceptable pour la
  délivrance d'un paiement (c'est exactement le sémantique du `setTimeout` actuel, version
  « plus longtemps »).
- File durable (Vercel Queues, Inngest, SQS) : la bonne réponse au-delà du MVP (rétries,
  observabilité, découplage) — **surcoût d'infrastructure injustifié aujourd'hui** ;
  documenter comme trajectoire d'évolution.

**Tests à ajouter** :

1. Intégration (via la route, pas via le service) : POST d'un événement signé
   `checkout.session.completed` valide → `200` **ET** commande `paid` + entitlement +
   panier vidé. (Aujourd'hui impossible à écrire correctement — c'est le symptôme du bug.)
2. Intégration : POST d'un événement dont le traitement lève (ex. montant incohérent, H-3)
   → `500` ; re-POST identique → re-traité (pas marqué « dupliqué »).

**Critères d'acceptation** : plus aucun travail planifié après le `return` dans le route
handler ; un échec de traitement produit un statut 5xx visible (→ retry Stripe) ; le
parcours paiement → entitlement est testé **via la route HTTP**, pas via le service.

---

## H-2 — Réutilisation de commande par `(userId, total)` : entitlements sur le mauvais panier

**Code concerné** : `src/features/checkout/infrastructure/checkout-repo.ts:33-73`
(`createPendingOrder`)

```ts
const existing = await db
  .select({ id: orders.id })
  .from(orders)
  .where(
    and(
      eq(orders.userId, userId),
      eq(orders.status, "pending"),
      eq(orders.totalInCents, totalInCents), // ← même TOTAL, contenu ignoré
    ),
  )
  .orderBy(sql`${orders.createdAt} desc`)
  .limit(1);

const orderId = existing[0]?.id ?? id;
if (existing.length === 0) {
  // insertion de la commande + de ses items — SAUTÉE si une commande « identique » existe
}
```

**Cause racine** : l'optimisation « éviter d'accumuler des commandes pending à chaque clic
Payer » identifie la commande sur `(userId, status, totalInCents)` — **pas sur la
composition du panier**. Deux paniers différents peuvent avoir le même total.

**Scénario d'échec concret** (démontrable, pas inféré) :

1. Panier A = 2 livres à 1,00 $ → le client clique « Payer », abandonne sur Stripe
   → commande A `pending`, total 200¢, items A en base.
2. Panier B = 1 livre à 2,00 $ → checkout B : même userId, même total 200¢,
   `status=pending` existe → **l'orderId de A est réutilisé, les items de B ne sont pas
   insérés**.
3. La session Stripe B est créée avec les **line items de B** (prix serveur, correct) —
   le client paie bien 2,00 $ **pour le livre B**.
4. Le webhook fait `grantEntitlements(userId, orderId)` → **les items de A** sont délivrés.

Résultat : le client paie le livre B, reçoit le droit sur le livre A. Inversement, un client
peut « payer » une commande dont les items ne correspondent pas au montant réellement
encaissé. C'est un bug de délivrance, pas cosmétique.

**Pourquoi ce n'est pas détecté** : aucun test n'exécute deux checkouts de même total et de
contenu différent ; l'intégration checkout ne couvre qu'un seul parcours.

**Correction (recommandée)** : **toujours créer une nouvelle commande** — l'identité d'une
commande est son contenu, pas son total. La duplication de _sessions_ Stripe (double clic)
est déjà gérée par l'`Idempotency-Key` ; l'accumulation de commandes `pending` est un
problème d'hygiène, pas de correction :

```ts
export async function createPendingOrder(userId, items, totalInCents, currency) {
  const orderId = crypto.randomUUID().replace(/-/g, "");
  // (optionnel, housekeeping) vider les anciennes commandes pending de l'utilisateur
  await db.delete(orders).where(and(eq(orders.userId, userId), eq(orders.status, "pending")));
  await db
    .insert(orders)
    .values({ id: orderId, userId, status: "pending", totalInCents, currency });
  for (const it of items) {
    await db.insert(orderItems).values({ orderId, ...snapshot(it) });
  }
  return { orderId, isNew: true };
}
```

(Le `delete` des anciennes pending est optionnel : une commande `pending` n'est jamais
encaissée. Le supprimer est un choix d'ergonomie — `mes commandes` ne montre que les
commandes réelles. À décider.)

**Tests à ajouter** :

1. Intégration : panier A (2×100¢) → checkout → abandon ; panier B (1×200¢) → checkout →
   **deux commandes distinctes** ; webhook sur B → entitlement **uniquement sur B**.
2. Intégration : double checkout identique (même panier, deux clics) → pas de doublon de
   session Stripe (Idempotency-Key) mais deux commandes sont tolérées.

**Critères d'acceptation** : l'entitlement délivré correspond **toujours** aux items de la
commande référencée par la session payée ; aucun matching par total.

---

## H-3 — Webhook sans vérification `payment_status` ni `amount_total`

**Code concerné** : `src/features/checkout/application/webhook-service.ts:46-60`
(`handleWebhook`)

```ts
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;
  // … aucun contrôle de session.payment_status ni de session.amount_total
  await markOrderPaid(orderId);
  await grantEntitlements(userId, orderId);
  ...
```

**Sémantique Stripe (source officielle)** : pour les méthodes à **notification différée**
(virements, certaines méthodes locales), `checkout.session.completed` signifie
_« le client a soumis le formulaire »_ et la session a `payment_status: "unpaid"` — Stripe
demande explicitement d'attendre `checkout.session.async_payment_succeeded` avant de
livrer :

> « `checkout.session.completed` — The customer has successfully authorized the debit
> payment by submitting the embedded form. → **Wait for the payment to succeed or fail.** »
> et le sample officiel vérifie `if (checkout_session.payment_status == 'paid')` avant
> `fulfill_order` —
> <https://docs.stripe.com/payments/advanced/dashboard-payment-methods>

**Niveau de risque (précision d'honnêteté)** : pour une carte (méthode synchrone),
`completed` implique bien « payé » — donc **sur un compte test cartes seules, le bug ne
s'active pas**. Mais rien dans la config ne restreint les méthodes de paiement
(`automatic_payment_methods` non réglé) : la première méthode différée activée sur le
compte (test ou prod) ouvre le trou — **livraison d'un livre non payé**. C'est un gap
défensif avec un scénario d'activation concret, pas une faille démontrée aujourd'hui.

**Deuxièmement** : aucun contrôle `session.amount_total === order.totalInCents`. Si le prix
a changé entre la création de la session et le paiement, on livre la commande **sans
jamais comparer** ce qui a été encaissé.

**Correction** :

```ts
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;
  if (!orderId || !userId) return { status: "ignored_missing_metadata" };

  // 1. Méthode différée : pas payé → pas de délivrance.
  if (session.payment_status !== "paid") {
    return { status: "awaiting_payment" }; // sera complété par async_payment_succeeded (étape H-3b)
  }
  // 2. Contrôle croisé du montant (ce qui a été encaissé vs la commande).
  const order = await getOrder(orderId);
  if (!order || order.totalInCents !== session.amount_total) {
    console.error("[webhook] amount mismatch", { orderId, expected: order?.totalInCents, got: session.amount_total });
    return { status: "amount_mismatch" }; // NE PAS livrer, alerter
  }
  await fulfillPaidOrder(orderId, userId); // H-4 : transaction
  return { status: "fulfilled", orderId };
}
```

**Étape H-3b (complément)** : handler `checkout.session.async_payment_succeeded` →
délivrance (même `fulfillPaidOrder`, idempotent), et `checkout.session.async_payment_failed`
→ commande `failed`. Seulement si/une méthode différée est activée — sinon documenter le
choix « cartes seules ».

**Tests à ajouter** (unitaires, événement Stripe fabriqué) :

1. `completed` + `payment_status: "unpaid"` → **aucun** `markOrderPaid`/`grantEntitlements`.
2. `completed` + `paid` + montant cohérent → délivrance.
3. `completed` + `paid` + montant différent de la commande → **pas** de délivrance + statut
   `amount_mismatch`.

**Critères d'acceptation** : aucune délivrance sans `payment_status === "paid"` **et**
montant vérifié ; la décision est testable sans Stripe réel (événement unitaire).

---

## H-4 — Pas de transaction : le commentaire ment

**Code concerné** : `src/features/checkout/infrastructure/checkout-repo.ts:93-115`
(`grantEntitlements`)

```ts
/**
 * Crée des entitlements (droits d'accès) dans une transaction, avec un seul droit
 * par produit acheté (contrainte unique). …
 */
export async function grantEntitlements(userId: string, orderId: string) {
  const items = await getOrderItems(orderId);
  let created = 0;
  for (const item of items) {
    const res = await db.insert(entitlements) …   // N inserts séparés, AUCUNE transaction
    created += res.length;
  }
  return created;
}
```

**Cause racine** : docblock « dans une transaction » + code sans `db.transaction`.
Conséquence combinée avec H-1 : `recordStripeEvent` committe « traité » **avant** la
délivrance ; si la délivrance crashe à mi-chemin, l'évènement est marqué → **aucun retry
possible** → entitlement **partiel définitif** (le client a le livre 1 sur 2).

**Correction** : une seule transaction atomique — enregistrer l'évènement, marquer payée,
délivrer, vider le panier. Si elle lève, **rien** n'est commité, la route (H-1) répond 500,
Stripe retente, et comme l'évènement n'est pas marqué, le re-traitement est complet :

```ts
export async function fulfillPaidOrder(orderId: string, userId: string): Promise<number> {
  return db.transaction(async (tx) => {
    // 1. Idempotence atomique : si déjà traité, on ne refait rien.
    const inserted = await tx.insert(stripeEvents).values({ … })
      .onConflictDoNothing({ target: stripeEvents.stripeEventId })
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) return 0; // dupliqué — déjà livré

    // 2. Marquer payée.
    await tx.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.id, orderId));

    // 3. Délivrer (un droit par produit, unique par (user, product)).
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    let created = 0;
    for (const item of items) {
      const res = await tx.insert(entitlements).values({ … })
        .onConflictDoNothing({ target: [entitlements.userId, entitlements.productId] })
        .returning({ id: entitlements.id });
      created += res.length;
    }

    // 4. Vider le panier.
    await tx.delete(cartItems).where(eq(cartItems.userId, userId));
    return created;
  });
}
```

**Tests à ajouter** :

1. Intégration : traitement normal → les 4 écritures sont présentes ensemble.
2. Intégration : forcer une erreur au milieu de la transaction (ex. FK cassée injectée) →
   **aucune** écriture commitée ; re-traitement de l'évènement → succès complet.
3. Intégration : re-POST du même événement → `duplicate`, aucune double délivrance.

**Critères d'acceptation** : il est impossible d'observer un état partiel
(entitlement sans « payée », ou « payée » sans event enregistré).

---

## H-5 — Zéro header de sécurité, et la doc l'affirme quand même

**Code concerné** : `next.config.ts` (vide — `{ /* config options here */ }`), aucun
`src/middleware.ts`.

**Constat** : pas de `X-Frame-Options` (le formulaire de connexion et le checkout sont
encadrables → **clickjacking**), pas de `X-Content-Type-Options: nosniff`, pas de
`Referrer-Policy`, pas de CSP. Pendant ce temps `docs/architecture.md` (§ Sécurité)
revendique « Headers de sécurité, cookies httpOnly+secure+sameSite » et décrit un
« Middleware = UX (redirection) » **qui n'existe pas**. La doc décrit des protections
absentes — c'est pire qu'un trou : c'est une fausse assurance pour quiconque révise.

**Correction (P1, ~10 lignes)** :

```ts
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
```

À vérifier au deploy : aucun outil interne ne cadre l'app (Vercel ouvre l'app dans un
nouvel onglet ; si jamais un outil a besoin d'iframe → passer `DENY` → `SAMEORIGIN`
**avec justification documentée**). CSP : étape P2 distincte (nécessite un balayage des
sources — polices système, pas de CDN, donc faisable).

**Correction doc** : réécrire § Sécurité de `docs/architecture.md` — supprimer les claims
non tenus (middleware, headers) ou pointer vers ce qui est fait (re-vérification serveur
dans chaque route — qui, elle, est réelle).

**Tests à ajouter** : e2e (ou integration HTTP) — `GET /` expose les 3 headers.

**Critères d'acceptation** : headers présents sur toutes les routes ; doc conforme au code.

---

## H-6 — Remboursement sans révocation d'entitlement

**Code concerné** : `src/features/admin/application/admin-order-service.ts`
(`updateOrderStatus`) + absence de tout code de révocation.

**Constat** : l'admin peut passer une commande en `refunded` (UI + API). L'entitlement —
qui n'a pas d'`expiresAt` — **reste actif** : le client remboursé continue de télécharger.
Soit le remboursement révoque, soit le remboursement n'existe pas. Aujourd'hui les deux
mondes coexistent.

**Correction (recommandée)** : la transition vers `refunded` **révoque les entitlements de
la commande**, dans la même transaction que le changement de statut :

```ts
if (parsed.data.status === "refunded") {
  await tx.delete(entitlements).where(eq(entitlements.orderId, id));
}
```

Alternative (si la politique métier est « pas de remboursement ») : retirer l'option
`refunded` du sélecteur admin et documenter le choix — mais garder le statut sans effet est
la pire option.

**Tests à ajouter** : intégration — commande paid + entitlement → passer en `refunded` →
entitlement supprimé → `POST /api/me/library/[productId]/download` → **403**.

**Critères d'acceptation** : un client `refunded` ne peut plus télécharger ; l'alternative
« pas de remboursement » est alors documentée et l'UI alignée.

---

## Items légers (registre — pas d'action immédiate)

| ID  | Constat                                                                                                       | Correction suggérée                                                                                                  | Quand        |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------ |
| L-1 | Pas de machine à états : l'API admin permet `paid → pending`, `refunded → paid`, n'importe quoi               | Tableau des transitions autorisées + validation (ex. `refunded` terminal)                                            | P2, avec H-6 |
| L-2 | `createCheckout` : `currency = cartItems[0].currency`, somme de centimes multi-devises possible               | Check mono-devises au checkout → 400 explicite (la boutique est USD-only : le rendre une règle, pas une supposition) | P2           |
| L-3 | `STRIPE_TAX_CODE` lu à l'import du module (`stripe-checkout.ts`) : verrouillé au premier import, non testable | Lire dans la fonction `createCheckoutSession`                                                                        | P3 (1 ligne) |
| L-4 | Les comptes e2e (`e2e-*@biblio.test`) s'accumulent sans cleanup                                               | Acceptable en CI (base éphémère) ; en base de dev locale, cleanup manuel ou script                                   | P3           |
| L-5 | `docs/lighthouse.md` : mesures sur CPU de sandbox partagée (documenté tel quel)                               | Re-mesurer sur l'URL Vercel (mobile + desktop) **avant** de citer quoi que ce soit dans l'étude de cas               | au deploy    |

## Ce qui a été revu et est solide (ne pas toucher)

Pour l'équilibre — la revue n'a pas tout troué :

- **Signature webhook** : corps brut (`request.text()`) avant parsing, `constructEvent`,
  400 si invalide/absente — mécanisme correct, **testé** avec signature générée.
- **Autorisation objet** au téléchargement : `userHasEntitlement(userId, productId)` par
  objet, mapping 401/403/404/503 propre — pas d'IDOR.
- **Prix 100 % serveur** : `getCartForCheckout` rejoint `products` (publiés uniquement),
  total du panier en base, Zod aux frontières, quantités 1..10.
- **RBAC** : `requireAdmin`/`requireUser` re-vérifiés par requête, `role` non modifiable
  côté client, panneau 403 honnête.
- **Presign** : SigV4 query-string, TTL 15 min, les fichiers ne transitent jamais par l'app.
- **Stats (Slice 8)** : revenu paid/fulfilled uniquement, agrégations sans N+1, méthode en
  écarts correcte contre base partagée.
- **Slug** : unicité (409), protection de suppression si référencé par `order_items` (409).

## Plan d'exécution

| Bloc  | Contenu                          | Statut (2026-09-05)                                                                                                                                                                                                                          |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **H-1 + H-3 + H-4** (un seul PR) | ✅ commit `59cfcac` — route attend le traitement (500 sur erreur), `payment_status` + `amount_total` + vérif d'identité user/order, `async_payment_succeeded`/`async_payment_failed` gérés, `fulfillPaidOrder` transactionnel |
| **2** | **H-2**                          | ✅ commit `0fa83b2` — toujours une commande neuve + purge des pending obsolètes, dans une transaction                                                                                                                                        |
| **3** | **H-5**                          | ✅ commit `709c28c` — 6 headers dans `next.config.ts`, figés en unit et vérifiés en e2e, smoke test réel (`next start` + curl), `architecture.md` réécrite                                                                                  |
| **4** | **H-6** (+ début de L-1)         | ✅ commit `f64c79d` — `refundOrderById` transactionnel (révocation par produit, conservation si doublon couvert), garde d'état 409 pour tout ce qui n'est pas paid/fulfilled                                                                |

Estimation : blocs 1-2 = l'essentiel du travail (corrections + tests d'intégration via la
route HTTP). **Porte d'entrée : aucun déploiement réel (Slice 10) avant les blocs 1-4.** → levée.

## Exécution — écarts par rapport aux esquisses du présent document (honnêteté)

- **H-1** : comme esquissé (await avant réponse, 500 sur erreur). Test 2 de la liste
  (« forcer une erreur de traitement → 500 ») : le scénario d'écart de montant couvre le
  rejet **non** 5xx ; le chemin 500 est atteint par n'importe quelle exception DB — la
  logique est vérifiée par les tests via-route, la faute d'injection n'a pas été faite.
- **H-4** : l'idempotence par `stripe_events` reste **avant** la transaction (comme avant,
  double file), et la transaction ajoute une **check-and-set atomique**
  (`UPDATE … WHERE status IN (pending, failed)` → `paid`) : c'est elle qui rend le
  fulfillment idempotent à l'intérieur, pas l'insert d'évènement. L'état partiel reste
  impossible (garde testée : déjà soldée → null ; refundée → null).
- **H-2** : comme recommandé — toujours une commande neuve **et** suppression des pending
  antérieures (choix « propre pour /orders »), le tout dans la transaction de création.
- **H-5** : au-delà des 3 headers esquissés — ajoutés `Strict-Transport-Security`,
  `Permissions-Policy`, `Cross-Origin-Resource-Policy` ; `Referrer-Policy: no-referrer`
  (plus strict que l'esquisse, l'app n'a aucune raison de renvoyer d'URL à quiconque).
  CSP : P2 distincte, comme prévu.
- **H-6** : la révocation est **par produit de la commande remboursée**, pas par
  `entitlements.orderId` — l'entitlement d'un produit acheté en double appartient à la
  **première** commande (index unique user+produit) ; une suppression par orderId
  révoquerait trop ou trop peu. Règle implémentée : on révoque sauf si le produit est
  encore couvert par une autre commande paid/fulfilled du même utilisateur.
- **L-1 (début)** : le cas `refunded` a désormais une validation d'état (409 INVALID_STATE
  pour pending/failed/refunded). Le reste de la machine à états (ex. `paid → pending`)
  reste ouvert — P2.
- **H-3b — correction post-implémentation (important, signalée sans filtre)** : la
  première implémentation comparait `event.type` à `async_payment_succeeded` /
  `async_payment_failed` **sans le préfixe** `checkout.session.` — or c'est le nom
  namespaced que Stripe envoie réellement. En production, ces deux événements seraient
  tombés dans `unhandled` (paiements différés jamais livrés, échecs jamais marqués), et
  mes tests de l'époque reproduisaient le même mauvais nom, donc ils passaient. Trouvé en
  confrontant la liste d'événements du SDK Stripe. Leçon codée : **le nom d'un événement
  de plateforme se vérifie contre sa source de vérité (SDK/doc), pas contre le nom qu'on
  avait dans la tête** — et un test qui fabrique ses propres fixtures doit d'abord
  vérifier que la fixture est fidèle à la réalité.
- **Tests** : +20 tests au total (13 d'intégration du parcours via la route HTTP signée —
  exactement le chemin Vercel — + 2 unit de la config headers + 5 d'intégration du
  remboursement). La CI ajoute les e2e headers (inexécutables dans le sandbox).
- **Infra de test — correction forcée par la CI** : les 5 premiers commits sont passés en
  local mais sont tombés en CI sur `admin-stats.test.ts` (« expected 2 to be 1 ») —
  **pas** sur un de mes tests. Diagnostic : ce test vérifie des deltas **exacts** sur des
  agrégats globaux de la base (méthode avant/après) ; mes nouvelles suites d'intégration
  (qui écrivent produits/commandes) changeaient l'intercalage du parallélisme vitest et
  écrivaient dans sa fenêtre de mesure (contaminant identifié : un produit brouillon du
  CRUD admin créé en parallèle). Non reproductible en local (machine rapide, fenêtres qui
  ne se chevauchent pas) — reproductible sur les 2 cœurs de la CI. Correction :
  `fileParallelism: false` dans `vitest.config.mts` — les fichiers de test partagent UNE
  base, donc ils s'exécutent à séquence ; la méthode en écarts n'est exacte qu'en
  exclusivité. Leçon : **une assertion de delta sur un état global est incompatible avec
  l'écriture concurrente** ; quand on ajoute des suites qui écrivent dans la base partagée,
  on re-vérifie l'isolation des autres suites.

## Décisions à trancher (ma position, à contester si tu as un argument)

**Les trois décisions ont été adoptées telles que recommandées (2026-09-05) et exécutées
aux blocs 1, 2 et 4.**

1. **H-1** : `await` avant réponse (recommandé MVP) — la file durable est la trajectoire
   post-MVP, pas le MVP. Conteste-moi si tu veux une file **maintenant** (je m'y
   opposerai : complexité d'infra non justifiée à ce stade, et l'`await` résout le risque
   identifié).
2. **H-2** : commande nouvelle par checkout + **suppression** des pending antérieures
   (propre pour `/orders`). Conteste-moi si tu veux conserver l'historique des pending
   (je répondrai : elles ne sont jamais encaissées, c'est de la saleté).
3. **H-6** : remboursement **révoque** (recommandé). Conteste-moi si la politique est «
   jamais de remboursement » → on retire le statut de l'UI au lieu de ça.

## Comment en parler dans l'étude de cas (Slice 11) — la version honnête

C'est précisément le genre d'histoire qui fait un portfolio senior, **à condition de ne pas
la maquiller** :

> « Avant de déployer, j'ai relu les chemins critiques du paiement **dans le code** — pas
> dans la doc. J'y ai trouvé trois bugs réels dont deux n'active que sur la cible
> serverless : mon “validé en réel” local validait le chemin heureux dans un process
> long-lived. Corrections : traitement du webhook **avant** la réponse (plus de
> fire-and-forget), délivrance **atomique** (transaction), vérification `payment_status` +
> montant, suppression d'une réutilisation de commande qui livrait le mauvais livre. Et le
> plus important : j'ai ajouté les tests qui manquaient — le parcours paiement est désormais
> testé **via la route HTTP**, pas via le service. La leçon codifiée : la CI verte ne
> garantit pas le contrat de plateforme ; la liste de garanties (livraison = await +
> transaction + vérifications) est passée dans le runbook comme porte d'entrée au
> déploiement. »

Ce qui différencie cette version : les bugs sont nommés **avec leurs mécanismes**, la
limite de l'environnement de test est reconnue (pas “tout était parfait”), et il y a une
**règle systémique** sortie de l'épisode (tests via la route HTTP, garanties dans le
runbook). Pas de « j'ai résolu un problème de webhook » flou.
