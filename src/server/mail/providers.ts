/**
 * Fournisseurs d'e-mail transactionnel — sélectionnés par `MAIL_PROVIDER`.
 *
 * Même philosophie que `src/server/storage` : un adaptateur par variable
 * d'environnement, aucune infrastructure nouvelle (pas de file, pas de worker).
 *
 * - `console` (défaut) : journalise le message, n'envoie rien. C'est le mode
 *   des sandboxes, de la CI et du dev local.
 * - `resend`  : API HTTPS https://api.resend.com/emails (Bearer `MAIL_API_KEY`).
 * - `postmark`: API HTTPS https://api.postmarkapp.com/email (`X-Postmark-Server-Token`).
 * - `ses`     : Amazon SES v2 via `@aws-sdk/client-sesv2` (credentials AWS standard
 *   ou `MAIL_AWS_ACCESS_KEY_ID` / `MAIL_AWS_SECRET_ACCESS_KEY`, région `MAIL_AWS_REGION`).
 *
 * Tous les fournisseurs reçoivent un `MailMessage` déjà rendu (sujet, texte, HTML) :
 * les templates ne connaissent pas le transport.
 */

export type MailProviderName = "console" | "resend" | "postmark" | "ses";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Identifiant métier (ex. `receipt:<orderId>`) — utile pour l'idempotence côté fournisseur. */
  tag?: string;
}

export interface MailSendResult {
  provider: MailProviderName;
  /** `true` si un fournisseur réel a accepté le message ; `false` en mode console. */
  delivered: boolean;
  /** Identifiant renvoyé par le fournisseur, si disponible. */
  messageId?: string;
}

export interface MailProvider {
  readonly name: MailProviderName;
  send(message: MailMessage, from: string): Promise<MailSendResult>;
}

export interface MailConfig {
  provider: MailProviderName;
  from: string;
  apiKey: string | undefined;
  aws: {
    region: string;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
  };
}

const PROVIDERS: readonly MailProviderName[] = ["console", "resend", "postmark", "ses"];

/** Lit la configuration depuis l'environnement (valeurs `trim()`ées, défauts sûrs). */
export function getMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const raw = (env.MAIL_PROVIDER ?? "console").trim().toLowerCase();
  const provider = (PROVIDERS as readonly string[]).includes(raw)
    ? (raw as MailProviderName)
    : "console";

  return {
    provider,
    from: env.MAIL_FROM?.trim() || "Biblio <no-reply@localhost>",
    apiKey: env.MAIL_API_KEY?.trim() || undefined,
    aws: {
      region: env.MAIL_AWS_REGION?.trim() || env.AWS_REGION?.trim() || "eu-west-1",
      accessKeyId: env.MAIL_AWS_ACCESS_KEY_ID?.trim() || undefined,
      secretAccessKey: env.MAIL_AWS_SECRET_ACCESS_KEY?.trim() || undefined,
    },
  };
}

/**
 * `true` si un fournisseur RÉEL est sélectionné et que ses secrets sont présents.
 * En mode `console`, renvoie `false` (le module reste utilisable, rien ne part).
 */
export function isMailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const c = getMailConfig(env);
  switch (c.provider) {
    case "console":
      return false;
    case "resend":
    case "postmark":
      return Boolean(c.apiKey);
    case "ses":
      return Boolean(
        (c.aws.accessKeyId && c.aws.secretAccessKey) ||
        (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
      );
  }
}

type FetchLike = typeof fetch;

/** Provider « console » : trace et n'envoie rien. */
export function createConsoleProvider(
  log: (line: string) => void = (l) => console.info(l),
): MailProvider {
  return {
    name: "console",
    async send(message, from) {
      log(
        `[mail:console] from=${from} to=${message.to} tag=${message.tag ?? "-"} subject=${JSON.stringify(
          message.subject,
        )}`,
      );
      return { provider: "console", delivered: false };
    },
  };
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/** Provider Resend (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendProvider(apiKey: string, fetchImpl: FetchLike = fetch): MailProvider {
  return {
    name: "resend",
    async send(message, from) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(message.tag ? { "Idempotency-Key": message.tag } : {}),
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(message.tag ? { tags: [{ name: "biblio", value: sanitizeTag(message.tag) }] } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Resend a refusé l'envoi (HTTP ${res.status}) : ${await readErrorBody(res)}`,
        );
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { provider: "resend", delivered: true, messageId: data.id };
    },
  };
}

/** Provider Postmark (https://postmarkapp.com/developer/api/email-api). */
export function createPostmarkProvider(
  serverToken: string,
  fetchImpl: FetchLike = fetch,
): MailProvider {
  return {
    name: "postmark",
    async send(message, from) {
      const res = await fetchImpl("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": serverToken,
        },
        body: JSON.stringify({
          From: from,
          To: message.to,
          Subject: message.subject,
          TextBody: message.text,
          HtmlBody: message.html,
          MessageStream: "outbound",
          ...(message.tag ? { Tag: sanitizeTag(message.tag) } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Postmark a refusé l'envoi (HTTP ${res.status}) : ${await readErrorBody(res)}`,
        );
      }
      const data = (await res.json().catch(() => ({}))) as { MessageID?: string };
      return { provider: "postmark", delivered: true, messageId: data.MessageID };
    },
  };
}

/** Provider Amazon SES v2 (SDK chargé paresseusement : absent des bundles qui ne l'utilisent pas). */
export function createSesProvider(config: MailConfig["aws"]): MailProvider {
  return {
    name: "ses",
    async send(message, from) {
      const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
      const client = new SESv2Client({
        region: config.region,
        ...(config.accessKeyId && config.secretAccessKey
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
              },
            }
          : {}),
      });
      const out = await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: message.text, Charset: "UTF-8" },
                Html: { Data: message.html, Charset: "UTF-8" },
              },
            },
          },
          ...(message.tag
            ? { EmailTags: [{ Name: "biblio", Value: sanitizeTag(message.tag) }] }
            : {}),
        }),
      );
      return { provider: "ses", delivered: true, messageId: out.MessageId };
    },
  };
}

/** Les fournisseurs limitent les tags à `[A-Za-z0-9_-]`. */
export function sanitizeTag(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

/** Fabrique le provider correspondant à la configuration (console si incomplet). */
export function createMailProvider(
  config: MailConfig = getMailConfig(),
  deps: { fetchImpl?: FetchLike; log?: (line: string) => void } = {},
): MailProvider {
  switch (config.provider) {
    case "resend":
      if (config.apiKey) return createResendProvider(config.apiKey, deps.fetchImpl);
      break;
    case "postmark":
      if (config.apiKey) return createPostmarkProvider(config.apiKey, deps.fetchImpl);
      break;
    case "ses":
      return createSesProvider(config.aws);
    case "console":
      break;
  }
  return createConsoleProvider(deps.log);
}
