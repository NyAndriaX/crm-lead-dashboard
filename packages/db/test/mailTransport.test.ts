import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountTransport, GMAIL_API_HOST, isGmailApiAccount } from "../src/mailTransport";

test("compte Gmail (API) : jeton rafraîchi puis message MIME envoyé à users.messages.send", async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
  const calls: { url: string; body: string; auth?: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: String(init?.body ?? ""), auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at-123", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "gm-1", threadId: "th-1" }), { status: 200 });
  }) as typeof fetch;
  try {
    const t = createAccountTransport({ host: GMAIL_API_HOST, port: 443, login: "moi@gmail.com", pass: "refresh-xyz" });
    const info = await t.sendMail({
      from: '"Tsilavina" <moi@gmail.com>', to: "lead@example.com", subject: "Bonjour",
      html: "<p>Salut</p>", messageId: "<crm-c1-l1-A@gmail.com>", headers: { "List-Unsubscribe": "<https://x/unsub>" },
    });
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.body, /refresh_token=refresh-xyz/);
    assert.equal(calls[1]!.url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(calls[1]!.auth, "Bearer at-123");
    const raw = Buffer.from(JSON.parse(calls[1]!.body).raw, "base64url").toString("utf8");
    assert.match(raw, /^To: lead@example\.com/m);
    assert.match(raw, /^Message-ID: <crm-c1-l1-A@gmail\.com>/m);
    assert.match(raw, /^List-Unsubscribe: <https:\/\/x\/unsub>/m);
    assert.equal((info as { messageId: string }).messageId, "<crm-c1-l1-A@gmail.com>");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("autorisation révoquée : message clair", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
  try {
    const t = createAccountTransport({ host: GMAIL_API_HOST, port: 443, login: "moi@gmail.com", pass: "revoked" });
    await assert.rejects(() => t.verify(), /reconnectez le compte/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("détection du type de compte", () => {
  assert.equal(isGmailApiAccount("gmail-api"), true);
  assert.equal(isGmailApiAccount("smtp.gmail.com"), false);
});
