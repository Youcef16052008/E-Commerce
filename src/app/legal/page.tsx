import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales, confidentialité et licence",
  description:
    "Éditeur, conditions de vente des e-books, politique de confidentialité (RGPD) et licence de contenu de Biblio.",
};

const UPDATED = "26 septembre 2026";

/**
 * Page légale statique (RSC, aucune donnée utilisateur).
 * Quatre volets : éditeur · CGV · confidentialité (RGPD) · licence de contenu.
 * Les valeurs entre crochets sont à compléter par l'exploitant avant mise en
 * production (voir docs/runbook-deploy.md §1) — elles ne sont pas inventées ici.
 */
export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        Mentions légales &amp; confidentialité
      </h1>
      <p className="mt-1 text-sm text-neutral-500">Dernière mise à jour : {UPDATED}</p>

      <nav aria-label="Sommaire" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href="#editeur" className="underline hover:text-neutral-900">
          Éditeur
        </a>
        <a href="#cgv" className="underline hover:text-neutral-900">
          Conditions de vente
        </a>
        <a href="#confidentialite" className="underline hover:text-neutral-900">
          Confidentialité (RGPD)
        </a>
        <a href="#licence" className="underline hover:text-neutral-900">
          Licence de contenu
        </a>
      </nav>

      <section id="editeur" className="mt-10 space-y-3 text-neutral-800">
        <h2 className="text-xl font-semibold">1. Éditeur et hébergement</h2>
        <p>
          Biblio est un projet de librairie numérique édité par{" "}
          <span className="font-mono text-sm">[nom / raison sociale de l&apos;exploitant]</span>,{" "}
          <span className="font-mono text-sm">[adresse]</span>, contact :{" "}
          <span className="font-mono text-sm">[adresse e-mail de contact]</span>.
        </p>
        <p>
          Hébergement de l&apos;application : Vercel Inc. (États-Unis). Base de données : Neon
          (région UE). Fichiers : Cloudflare R2. Paiement : Stripe Payments Europe Ltd.
        </p>
      </section>

      <section id="cgv" className="mt-10 space-y-3 text-neutral-800">
        <h2 className="text-xl font-semibold">2. Conditions générales de vente</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Produits :</strong> livres numériques (EPUB) livrés par téléchargement depuis
            votre bibliothèque personnelle, immédiatement après confirmation du paiement par Stripe.
          </li>
          <li>
            <strong>Prix :</strong> affichés en dollars américains (USD), toutes taxes comprises le
            cas échéant. La boutique fonctionne actuellement en <strong>mode test Stripe</strong> :
            aucun paiement réel n&apos;est encaissé.
          </li>
          <li>
            <strong>Droit de rétractation :</strong> conformément à l&apos;article L221-28 13° du
            Code de la consommation, le droit de rétractation ne s&apos;applique pas aux contenus
            numériques dont l&apos;exécution a commencé avec votre accord exprès. En validant la
            commande, vous demandez l&apos;accès immédiat et renoncez à ce droit.
          </li>
          <li>
            <strong>Remboursements :</strong> un remboursement peut être accordé au cas par cas
            (fichier défectueux, double achat). Il est exécuté via Stripe et entraîne le retrait du
            titre de votre bibliothèque. Un e-mail de confirmation vous est adressé.
          </li>
          <li>
            <strong>Preuve :</strong> l&apos;historique de vos commandes est consultable dans{" "}
            <Link href="/orders" className="underline">
              Mes commandes
            </Link>{" "}
            et inclus dans votre export de données.
          </li>
        </ul>
      </section>

      <section id="confidentialite" className="mt-10 space-y-3 text-neutral-800">
        <h2 className="text-xl font-semibold">3. Politique de confidentialité (RGPD)</h2>
        <h3 className="font-semibold">Données traitées et finalités</h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left">
              <th className="py-1 pr-3">Donnée</th>
              <th className="py-1 pr-3">Finalité · base légale</th>
              <th className="py-1">Conservation</th>
            </tr>
          </thead>
          <tbody className="align-top">
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-3">E-mail, nom, mot de passe (haché)</td>
              <td className="py-1 pr-3">Compte et connexion · exécution du contrat</td>
              <td className="py-1">Jusqu&apos;à suppression du compte</td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-3">Sessions (jeton, navigateur, IP)</td>
              <td className="py-1 pr-3">Sécurité de la connexion · intérêt légitime</td>
              <td className="py-1">Durée de la session (7 jours max)</td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-3">Panier, droits d&apos;accès</td>
              <td className="py-1 pr-3">Vente et livraison · exécution du contrat</td>
              <td className="py-1">Jusqu&apos;à suppression du compte</td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="py-1 pr-3">Commandes, remboursements</td>
              <td className="py-1 pr-3">Facturation et comptabilité · obligation légale</td>
              <td className="py-1">10 ans (art. L123-22 C. com.), anonymisées à la suppression</td>
            </tr>
            <tr>
              <td className="py-1 pr-3">Données de paiement</td>
              <td className="py-1 pr-3">Traitées par Stripe, responsable distinct</td>
              <td className="py-1">Selon la politique de Stripe</td>
            </tr>
          </tbody>
        </table>
        <h3 className="font-semibold">Cookies</h3>
        <p>
          Un seul cookie, strictement nécessaire : le cookie de session (httpOnly, sécurisé). Aucun
          traceur publicitaire, aucune mesure d&apos;audience tierce.
        </p>
        <h3 className="font-semibold">Vos droits (art. 15 à 21 RGPD)</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Accès et portabilité :</strong> depuis{" "}
            <Link href="/account" className="underline">
              Mon compte
            </Link>
            , téléchargez un export JSON complet et lisible par machine.
          </li>
          <li>
            <strong>Effacement :</strong> depuis la même page, supprimez votre compte. Sans
            commande, tout est effacé ; avec des commandes, le compte est anonymisé (identité, mot
            de passe, sessions, panier et droits effacés) et seules les pièces comptables sont
            conservées, sans lien nominatif.
          </li>
          <li>
            <strong>Rectification :</strong> par e-mail à l&apos;adresse de contact ci-dessus.
          </li>
          <li>
            <strong>Réclamation :</strong> auprès de la CNIL (
            <a href="https://www.cnil.fr" className="underline" rel="noreferrer">
              cnil.fr
            </a>
            ).
          </li>
        </ul>
        <p>
          Sous-traitants : Vercel (hébergement), Neon (base de données), Cloudflare (fichiers),
          Stripe (paiement), et le fournisseur d&apos;e-mail transactionnel configuré par
          l&apos;exploitant (Resend, Postmark ou Amazon SES). Les e-mails envoyés sont exclusivement
          liés à vos opérations (reçu, remboursement) : aucune prospection.
        </p>
      </section>

      <section id="licence" className="mt-10 space-y-3 text-neutral-800">
        <h2 className="text-xl font-semibold">4. Licence de contenu</h2>
        <p>
          Les œuvres du catalogue sont issues du <strong>domaine public</strong> (importées depuis
          le Project Gutenberg, avec la licence d&apos;origine conservée pour chaque titre). Ce que
          vous achetez n&apos;est pas l&apos;œuvre — libre de droits — mais un{" "}
          <strong>service</strong> : la mise en forme, l&apos;hébergement, la livraison sécurisée et
          la conservation dans votre bibliothèque.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Les fichiers sont fournis <strong>sans DRM</strong>.
          </li>
          <li>
            Chaque achat ouvre une <strong>licence personnelle, non transférable</strong> : un titre
            par compte (le panier n&apos;accepte pas de quantité supérieure à 1).
          </li>
          <li>
            Vous pouvez lire le fichier sur tous vos appareils et en conserver une copie personnelle
            ; le lien de téléchargement est temporaire (15 minutes) et régénérable depuis votre
            bibliothèque tant que votre compte existe.
          </li>
          <li>
            Le texte de l&apos;œuvre reste dans le domaine public : la licence ne restreint pas vos
            droits sur celui-ci. Elle ne couvre pas la revente du service ou du compte.
          </li>
          <li>
            Le catalogue lui-même, l&apos;application et sa présentation sont diffusés sous licence
            MIT (voir le dépôt du projet).
          </li>
        </ul>
      </section>
    </main>
  );
}
