#!/usr/bin/env node
/**
 * Test isolé — envoi email Microsoft 365 / Azure AD (sans intégration CRM).
 *
 * Variables requises :
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MAIL_SENDER
 *
 * Optionnel :
 *   AZURE_REFRESH_TOKEN  — si déjà obtenu via consentement OAuth utilisateur
 *   TEST_EMAIL_TO        — destinataire (défaut = MAIL_SENDER)
 *
 * Obtenir un refresh token (une fois) :
 *   dotenv -e .env -- node scripts/test-azure-email.mjs --device-code
 *
 * Usage :
 *   dotenv -e .env -- node scripts/test-azure-email.mjs
 */
import dns from "node:dns";
import https from "node:https";
import nodemailer from "nodemailer";

// Évite ETIMEDOUT quand IPv6 est annoncé par DNS mais injoignable (fréquent en local).
dns.setDefaultResultOrder("ipv4first");

const FETCH_TIMEOUT_MS = 30_000;

const tenantId = process.env.AZURE_TENANT_ID?.trim();
const clientId = process.env.AZURE_CLIENT_ID?.trim();
const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim();
const mailSender = process.env.MAIL_SENDER?.trim();
const refreshToken = process.env.AZURE_REFRESH_TOKEN?.trim();
const testTo = process.env.TEST_EMAIL_TO?.trim() || mailSender;

function log(title, detail) {
  console.log(`\n── ${title} ──`);
  if (detail !== undefined) console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
}

function missing() {
  const req = { AZURE_TENANT_ID: tenantId, AZURE_CLIENT_ID: clientId, AZURE_CLIENT_SECRET: clientSecret, MAIL_SENDER: mailSender };
  const absent = Object.entries(req).filter(([, v]) => !v).map(([k]) => k);
  if (absent.length) {
    console.error("Variables manquantes :", absent.join(", "));
    process.exit(1);
  }
}

async function azureFetch(url, init = {}) {
  const body =
    init.body instanceof URLSearchParams
      ? init.body.toString()
      : typeof init.body === "string"
        ? init.body
        : undefined;
  const headers = {
    ...(init.headers ?? {}),
    ...(body != null ? { "Content-Length": Buffer.byteLength(body) } : {}),
  };

  const tryHttps = () =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          port: 443,
          path: `${u.pathname}${u.search}`,
          method: init.method ?? "GET",
          headers,
          family: 4,
          timeout: FETCH_TIMEOUT_MS,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
              ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
              status: res.statusCode ?? 0,
              text: async () => text,
              json: async () => JSON.parse(text || "{}"),
            });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("HTTPS timeout")));
      req.on("error", reject);
      if (body != null) req.write(body);
      req.end();
    });

  try {
    return await tryHttps();
  } catch (httpsErr) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (fetchErr) {
      const detail = httpsErr instanceof Error ? httpsErr.message : String(httpsErr);
      throw new Error(
        [
          "Connexion à Microsoft impossible (timeout réseau).",
          "",
          "Vérifications :",
          "  curl -4 -I https://login.microsoftonline.com/",
          "  (doit répondre HTTP 302 ou 200)",
          "",
          "Si curl échoue aussi → pare-feu, VPN ou proxy d'entreprise.",
          "Si curl OK → vérifiez AZURE_TENANT_ID / CLIENT_ID dans .env",
          "",
          `Détail HTTPS (IPv4) : ${detail}`,
        ].join("\n"),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fetchToken(body) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const res = await azureFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function tryClientCredentials(scope, label) {
  log(`Token — client_credentials (${label})`, `scope=${scope}`);
  const { ok, status, json } = await fetchToken({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });
  if (!ok) {
    log("Échec", { status, error: json.error, description: json.error_description });
    return null;
  }
  log("Succès", { token_type: json.token_type, expires_in: json.expires_in, scope: json.scope });
  return json.access_token;
}

async function tryRefreshToken() {
  if (!refreshToken) {
    log("Refresh token", "AZURE_REFRESH_TOKEN non défini — étape ignorée");
    return null;
  }
  log("Token — refresh_token (delegated SMTP.Send)");
  const { ok, status, json } = await fetchToken({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope: "https://outlook.office365.com/SMTP.Send offline_access",
  });
  if (!ok) {
    log("Échec", { status, error: json.error, description: json.error_description });
    return null;
  }
  log("Succès", { expires_in: json.expires_in, scope: json.scope });
  return json.access_token;
}

async function tryGraphSendMail(accessToken) {
  log("Graph API — POST /users/{sender}/sendMail");
  const res = await azureFetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailSender)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: "[CRM test] Microsoft Graph sendMail",
        body: { contentType: "Text", content: "Test Graph API — script test-azure-email.mjs" },
        toRecipients: [{ emailAddress: { address: testTo } }],
      },
      saveToSentItems: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    log("Échec Graph", { status: res.status, body: text.slice(0, 500) });
    return false;
  }
  log("Succès Graph", res.status === 202 ? "202 Accepted — email envoyé" : text);
  return true;
}

async function trySmtpOAuth(accessToken) {
  log("SMTP OAuth2 — smtp.office365.com:587 (XOAUTH2)");
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      type: "OAuth2",
      user: mailSender,
      accessToken,
    },
    tls: { rejectUnauthorized: true },
  });
  try {
    await transporter.verify();
    log("SMTP verify", "OK — connexion authentifiée");
  } catch (e) {
    log("SMTP verify échoué", e instanceof Error ? e.message : String(e));
    return false;
  }
  try {
    const info = await transporter.sendMail({
      from: `"CRM test Azure" <${mailSender}>`,
      to: testTo,
      subject: "[CRM test] SMTP OAuth2 Microsoft 365",
      text: "Test SMTP XOAUTH2 — script test-azure-email.mjs",
      html: "<p>Test SMTP XOAUTH2 — script <code>test-azure-email.mjs</code></p>",
    });
    log("Email SMTP envoyé", { messageId: info.messageId, to: testTo });
    return true;
  } catch (e) {
    log("SMTP send échoué", e instanceof Error ? e.message : String(e));
    return false;
  }
}

async function runDeviceCodeFlow() {
  log("Device code — consentement utilisateur (delegated SMTP.Send)");
  const deviceUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
  const deviceRes = await azureFetch(deviceUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      scope: "offline_access https://outlook.office365.com/SMTP.Send https://outlook.office365.com/IMAP.AccessAsUser.All User.Read",
    }),
  });
  const device = await deviceRes.json();
  if (!deviceRes.ok || !device.device_code) {
    log("Échec device code", device);
    process.exit(1);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  Connectez-vous avec : ${mailSender.padEnd(36)}║
╠══════════════════════════════════════════════════════════════════╣
║  1. Ouvrez : ${device.verification_uri}
║  2. Code   : ${device.user_code}
║  3. Attente du consentement…
╚══════════════════════════════════════════════════════════════════╝
`);

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const deadline = Date.now() + (device.expires_in ?? 900) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, (device.interval ?? 5) * 1000));
    const res = await azureFetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: device.device_code,
      }),
    });
    const json = await res.json();
    if (json.error === "authorization_pending") continue;
    if (json.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (!res.ok || !json.refresh_token) {
      log("Échec token device", json);
      process.exit(1);
    }
    console.log("\n✓ Refresh token obtenu — ajoutez dans .env :\n");
    console.log(`AZURE_REFRESH_TOKEN="${json.refresh_token}"\n`);
    return json.access_token;
  }
  console.error("Délai device code dépassé.");
  process.exit(1);
}

async function main() {
  missing();
  const deviceCodeMode = process.argv.includes("--device-code");

  if (deviceCodeMode) {
    const token = await runDeviceCodeFlow();
    await trySmtpOAuth(token);
    return;
  }

  console.log("Test Azure / Microsoft 365 — envoi email (hors CRM)");
  console.log(`Expéditeur : ${mailSender}`);
  console.log(`Destinataire : ${testTo}`);

  const results = { graphApp: false, smtpDelegated: false };

  // 1) Application token (Graph) — nécessite permission Application Mail.Send
  const graphToken = await tryClientCredentials("https://graph.microsoft.com/.default", "Graph application");
  if (graphToken) {
    results.graphApp = await tryGraphSendMail(graphToken);
  }

  // 2) Application token (Outlook) — rarement suffisant pour SMTP delegated
  const outlookToken = await tryClientCredentials("https://outlook.office365.com/.default", "Outlook application");

  // 3) Refresh token utilisateur — requis pour SMTP.Send delegated
  const userToken = (await tryRefreshToken()) || outlookToken;

  if (userToken) {
    results.smtpDelegated = await trySmtpOAuth(userToken);
  }

  log("Résumé", {
    graphSendMail_appPermission: results.graphApp ? "OK" : "non (permission Application Mail.Send probablement absente)",
    smtpOAuth_delegated: results.smtpDelegated ? "OK" : "non",
  });

  if (!results.graphApp && !results.smtpDelegated) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  Diagnostic — permissions DÉLÉGUÉES (SMTP.Send, IMAP.AccessAsUser.All)   ║
╠══════════════════════════════════════════════════════════════════════════╣
║  Tenant ID + Client Secret SEULS ne suffisent PAS pour SMTP delegated.   ║
║                                                                          ║
║  Étapes pour débloquer l'envoi :                                         ║
║  1. Consentement utilisateur une fois (adam.mehdi@datalia.app) :         ║
║     scope offline_access + https://outlook.office365.com/SMTP.Send       ║
║  2. Récupérer le refresh_token → AZURE_REFRESH_TOKEN dans .env            ║
║  3. Relancer ce script                                                   ║
║                                                                          ║
║  Alternative sans refresh token (recommandée serveur) :                  ║
║  • Azure Portal → API permissions → Application permissions             ║
║  • Ajouter Mail.Send (Application) + consentement admin                  ║
║  • Envoi via Graph API (testé ci-dessus)                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
`);
    process.exit(2);
  }

  console.log("\n✓ Au moins une méthode d'envoi a fonctionné.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
