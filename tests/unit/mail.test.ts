import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublicBaseUrl,
  renderReceipt,
  renderRefundNotice,
  resetMailProvider,
  safeSendReceipt,
  sendReceipt,
  sendRefundNotice,
} from "@/server/mail";
import {
  createMailProvider,
  createPostmarkProvider,
  createResendProvider,
  getMailConfig,
  isMailConfigured,
  sanitizeTag,
  type MailProvider,
} from "@/server/mail/providers";
import { escapeHtml, shortOrderRef } from "@/server/mail/templates";

/**
 * Tests unitaires du module `server/mail` (L5.1 / D-05) — aucun réseau :
 * les providers HTTP reçoivent un `fetch` factice.
 */

const MAIL_KEYS = [
  "MAIL_PROVIDER",
  "MAIL_FROM",
  "MAIL_API_KEY",
  "MAIL_AWS_REGION",
  "MAIL_AWS_ACCESS_KEY_ID",
  "MAIL_AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

const initialEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of MAIL_KEYS) {
    initialEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetMailProvider();
});

afterEach(() => {
  for (const key of MAIL_KEYS) {
    if (initialEnv[key] === undefined) delete process.env[key];
    else process.env[key] = initialEnv[key]!;
  }
  resetMailProvider();
  vi.restoreAllMocks();
});

const ORDER_ID = "0b3f9c2e-1d4a-4f6b-9a8c-7e6d5c4b3a21";

const receiptInput = {
  orderId: ORDER_ID,
  customerName: "Ada",
  currency: "usd",
  totalCents: 100,
  lines: [
    { title: "Les Misérables <Tome 1>", author: "Victor Hugo", priceCents: 50 },
    { title: "Candide", author: null, priceCents: 50 },
  ],
  libraryUrl: "https://biblio.example/library",
  paidAt: new Date("2026-09-25T10:30:00Z"),
};

describe("configuration (getMailConfig / isMailConfigured)", () => {
  it("défaut = console, non configuré, expéditeur de secours", () => {
    const c = getMailConfig();
    expect(c.provider).toBe("console");
    expect(c.from).toContain("no-reply@");
    expect(isMailConfigured()).toBe(false);
  });

  it("valeur inconnue de MAIL_PROVIDER → retombe sur console", () => {
    process.env.MAIL_PROVIDER = "pigeon";
    expect(getMailConfig().provider).toBe("console");
  });

  it("resend/postmark exigent MAIL_API_KEY", () => {
    process.env.MAIL_PROVIDER = "resend";
    expect(isMailConfigured()).toBe(false);
    process.env.MAIL_API_KEY = "re_test";
    expect(isMailConfigured()).toBe(true);
    process.env.MAIL_PROVIDER = "Postmark";
    expect(getMailConfig().provider).toBe("postmark");
    expect(isMailConfigured()).toBe(true);
  });

  it("ses accepte des credentials dédiés ou AWS standard", () => {
    process.env.MAIL_PROVIDER = "ses";
    expect(isMailConfigured()).toBe(false);
    process.env.MAIL_AWS_ACCESS_KEY_ID = "AKIA";
    process.env.MAIL_AWS_SECRET_ACCESS_KEY = "secret";
    expect(isMailConfigured()).toBe(true);
    expect(getMailConfig().aws.region).toBe("eu-west-1");
  });

  it("createMailProvider retombe sur console si la clé manque", () => {
    process.env.MAIL_PROVIDER = "resend";
    expect(createMailProvider(getMailConfig()).name).toBe("console");
    process.env.MAIL_API_KEY = "re_test";
    expect(createMailProvider(getMailConfig()).name).toBe("resend");
  });

  it("getPublicBaseUrl retire le slash final et a un défaut local", () => {
    expect(getPublicBaseUrl()).toBe("http://localhost:3000");
    process.env.BETTER_AUTH_URL = "https://biblio.example/";
    expect(getPublicBaseUrl()).toBe("https://biblio.example");
  });
});

describe("templates", () => {
  it("escapeHtml neutralise les 5 caractères sensibles", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("shortOrderRef = 8 hex majuscules", () => {
    expect(shortOrderRef(ORDER_ID)).toBe("0B3F9C2E");
  });

  it("renderReceipt : sujet, lignes, total, lien bibliothèque, HTML échappé", () => {
    const r = renderReceipt(receiptInput);
    expect(r.subject).toBe("Votre reçu Biblio — commande 0B3F9C2E");
    expect(r.text).toContain("Bonjour Ada,");
    expect(r.text).toContain("Les Misérables <Tome 1> (Victor Hugo)");
    expect(r.text).toContain("Candide");
    expect(r.text).toContain("Total : $1.00");
    expect(r.text).toContain("https://biblio.example/library");
    expect(r.text).toContain(ORDER_ID);
    expect(r.html).toContain("Les Misérables &lt;Tome 1&gt;");
    expect(r.html).not.toContain("<Tome 1>");
    expect(r.html).toContain('href="https://biblio.example/library"');
    expect(r.html).toContain("25 septembre 2026");
  });

  it("renderReceipt sans prénom → salutation neutre", () => {
    const r = renderReceipt({ ...receiptInput, customerName: null });
    expect(r.text.startsWith("Bonjour,\n")).toBe(true);
  });

  it("renderRefundNotice : intégral vs partiel, titres retirés", () => {
    const full = renderRefundNotice({
      orderId: ORDER_ID,
      currency: "usd",
      amountCents: 100,
      orderTotalCents: 100,
      titles: ["Candide"],
      ordersUrl: "https://biblio.example/orders",
    });
    expect(full.subject).toBe("Remboursement effectué — commande 0B3F9C2E");
    expect(full.text).toContain("remboursement intégral de $1.00");
    expect(full.text).toContain("  - Candide");
    expect(full.html).toContain("<li>Candide</li>");

    const partial = renderRefundNotice({
      orderId: ORDER_ID,
      currency: "usd",
      amountCents: 50,
      orderTotalCents: 100,
      titles: [],
      ordersUrl: "https://biblio.example/orders",
    });
    expect(partial.subject).toBe("Remboursement partiel — commande 0B3F9C2E");
    expect(partial.text).toContain("partiel de $0.50 (sur $1.00)");
    expect(partial.text).toContain("Aucun titre n'est retiré");
    expect(partial.html).not.toContain("<ul>");
  });
});

describe("providers HTTP (fetch factice)", () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    return { impl, calls };
  }

  it("resend : POST /emails avec Bearer, idempotency-key = tag, renvoie l'id", async () => {
    const { impl, calls } = fakeFetch(200, { id: "msg_1" });
    const p = createResendProvider("re_key", impl);
    const res = await p.send(
      { to: "a@b.test", subject: "S", text: "T", html: "<p>H</p>", tag: "receipt:x" },
      "Biblio <no-reply@biblio.test>",
    );
    expect(res).toEqual({ provider: "resend", delivered: true, messageId: "msg_1" });
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe("receipt:x");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.to).toEqual(["a@b.test"]);
    expect(body.from).toBe("Biblio <no-reply@biblio.test>");
    expect(body.tags[0].value).toBe("receipt_x");
  });

  it("resend : HTTP 4xx → erreur explicite (le secret n'apparaît pas)", async () => {
    const { impl } = fakeFetch(422, { message: "invalid from" });
    const p = createResendProvider("re_secret_key", impl);
    await expect(
      p.send({ to: "a@b.test", subject: "S", text: "T", html: "H" }, "x@y.test"),
    ).rejects.toThrow(/Resend .*HTTP 422/);
    await expect(
      p.send({ to: "a@b.test", subject: "S", text: "T", html: "H" }, "x@y.test"),
    ).rejects.not.toThrow(/re_secret_key/);
  });

  it("postmark : token en en-tête, champs PascalCase, MessageID", async () => {
    const { impl, calls } = fakeFetch(200, { MessageID: "pm-1" });
    const p = createPostmarkProvider("pm_token", impl);
    const res = await p.send(
      { to: "a@b.test", subject: "S", text: "T", html: "H", tag: "refund:o:50" },
      "x@y.test",
    );
    expect(res.messageId).toBe("pm-1");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["X-Postmark-Server-Token"]).toBe("pm_token");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ From: "x@y.test", To: "a@b.test", Tag: "refund_o_50" });
  });

  it("sanitizeTag : caractères hors [A-Za-z0-9_-] → _ , tronqué à 64", () => {
    expect(sanitizeTag("receipt:abc/def")).toBe("receipt_abc_def");
    expect(sanitizeTag("x".repeat(100))).toHaveLength(64);
  });
});

describe("façade sendReceipt / sendRefundNotice", () => {
  function spyProvider(fail = false): MailProvider & { sent: unknown[] } {
    const sent: unknown[] = [];
    return {
      name: "console",
      sent,
      async send(message, from) {
        if (fail) throw new Error("boom");
        sent.push({ message, from });
        return { provider: "console", delivered: false };
      },
    };
  }

  it("mode console par défaut : n'envoie pas mais journalise", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await sendReceipt("a@b.test", receiptInput);
    expect(res).toEqual({ provider: "console", delivered: false });
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]![0])).toContain("to=a@b.test");
    expect(String(info.mock.calls[0]![0])).toContain("tag=receipt:" + ORDER_ID);
  });

  it("utilise MAIL_FROM et propage le tag idempotent", async () => {
    process.env.MAIL_FROM = "Biblio <hello@biblio.test>";
    const p = spyProvider();
    await sendRefundNotice(
      "a@b.test",
      {
        orderId: ORDER_ID,
        currency: "usd",
        amountCents: 50,
        orderTotalCents: 100,
        titles: [],
        ordersUrl: "https://biblio.example/orders",
      },
      p,
    );
    const call = p.sent[0] as { message: { tag: string; subject: string }; from: string };
    expect(call.from).toBe("Biblio <hello@biblio.test>");
    expect(call.message.tag).toBe(`refund:${ORDER_ID}:50`);
    expect(call.message.subject).toContain("Remboursement partiel");
  });

  it("safeSendReceipt ne lève jamais : null + console.error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await safeSendReceipt("a@b.test", receiptInput, spyProvider(true));
    expect(res).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]![0])).toContain(ORDER_ID);
  });
});
