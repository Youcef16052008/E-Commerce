import { z } from "zod";

/**
 * Corps d'une création de checkout. Aucun montant ni produit n'est accepté du client :
 * tout est relu depuis le panier serveur.
 */
export const createCheckoutSchema = z.object({});
