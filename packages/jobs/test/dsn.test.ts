/**
 * M-11 — Analyse des rapports de non-remise sur des DSN au format réel (adresses anonymisées) :
 * Postfix, Gmail, Exchange Online, Exim, qmail ; plus deux messages qui ne sont PAS des DSN.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { simpleParser } from "mailparser";
import { classifyStatus, detectDsn, isDeliveryReport, maskEmails, parseCrmMessageId } from "../src/dsn";

const FIXTURES = path.join(__dirname, "fixtures", "dsn");

async function load(name: string) {
  const raw = fs.readFileSync(path.join(FIXTURES, name));
  return { parsed: await simpleParser(raw), raw };
}

test("Postfix 550 5.1.1 : rejet définitif, destinataire et Message-ID de la campagne retrouvés", async () => {
  const { parsed, raw } = await load("postfix-hard-5.1.1.eml");
  const r = detectDsn(parsed, raw);
  assert.ok(r);
  assert.equal(r.bounceType, "hard");
  assert.equal(r.status, "5.1.1");
  assert.equal(r.action, "failed");
  assert.equal(r.smtpCode, "550");
  assert.equal(r.recipient, "jean.dupont@boulangerie-dupont.fr");
  assert.equal(r.originalMessageIds[0], "crm-cmcampaign000000000000001-cmlead00000000000000000001-B@exemple-crm.fr");
  // Le diagnostic est conservé sans l'adresse en clair.
  assert.ok(r.diagnostic?.includes("User unknown"));
  assert.ok(!r.diagnostic?.includes("jean.dupont@"));
});

test("Gmail « Delivery Status Notification (Failure) » d'une relance de séquence", async () => {
  const { parsed, raw } = await load("gmail-hard-5.1.1.eml");
  const r = detectDsn(parsed, raw);
  assert.ok(r);
  assert.equal(r.bounceType, "hard");
  assert.equal(r.status, "5.1.1");
  assert.equal(r.recipient, "claire.martin.compta@gmail.com");
  const ref = parseCrmMessageId(r.originalMessageIds[0]);
  assert.deepEqual(ref, {
    kind: "sequence", sequenceId: "cmsequence00000000000000001", leadId: "cmlead00000000000000000002", stepIndex: 0,
  });
});

test("Exchange Online 5.1.10 (RecipientNotFound) avec en-têtes d'origine en text/rfc822-headers", async () => {
  const { parsed, raw } = await load("exchange-hard-5.1.10.eml");
  const r = detectDsn(parsed, raw);
  assert.ok(r);
  assert.equal(r.bounceType, "hard");
  assert.equal(r.status, "5.1.10");
  assert.equal(r.recipient, "contact@cabinet-leroy.fr");
  assert.deepEqual(parseCrmMessageId(r.originalMessageIds[0]), {
    kind: "campaign", campaignId: "cmcampaign000000000000002", leadId: "cmlead00000000000000000003", variant: "A",
  });
});

test("Postfix « Delayed Mail » 4.4.1 : échec temporaire", async () => {
  const { parsed, raw } = await load("postfix-delayed-4.4.1.eml");
  const r = detectDsn(parsed, raw);
  assert.ok(r);
  assert.equal(r.bounceType, "soft");
  assert.equal(r.status, "4.4.1");
  assert.equal(r.action, "delayed");
  assert.equal(r.recipient, "paul@garage-bernard.fr");
});

test("Exim 552 5.2.2 (boîte pleine), texte brut sans multipart/report : temporaire", async () => {
  const { parsed, raw } = await load("mailbox-full-5.2.2.eml");
  assert.equal(isDeliveryReport(parsed, raw), true);
  const r = detectDsn(parsed, raw);
  assert.ok(r);
  assert.equal(r.bounceType, "soft");
  assert.equal(r.status, "5.2.2");
  assert.equal(r.recipient, "sophie.roux@orange.fr");
  assert.equal(r.originalMessageIds[0], "crm-cmcampaign000000000000001-cmlead00000000000000000005-A@exemple-crm.fr");
});

test("qmail « failure notice » : code 550 5.1.1 lu dans le texte, rejet définitif", async () => {
  const { parsed, raw } = await load("qmail-failure-notice.eml");
  const r = detectDsn(parsed, raw);
  assert.ok(r);
  assert.equal(r.bounceType, "hard");
  assert.equal(r.status, "5.1.1");
  assert.equal(r.recipient, "marc@plomberie-petit.fr");
  assert.equal(parseCrmMessageId(r.originalMessageIds[0])?.kind, "campaign");
});

test("une vraie réponse (même citant « 550 5.1.1 ») n'est pas un rapport de non-remise", async () => {
  const { parsed, raw } = await load("reply-not-dsn.eml");
  assert.equal(detectDsn(parsed, raw), null);
});

test("un message d'absence (auto-reply) n'est pas un rapport de non-remise", async () => {
  const { parsed, raw } = await load("out-of-office-not-dsn.eml");
  assert.equal(detectDsn(parsed, raw), null);
});

test("classement des codes d'état étendus", () => {
  assert.equal(classifyStatus("5.1.1").type, "hard");
  assert.equal(classifyStatus("5.4.4").type, "hard");
  assert.equal(classifyStatus("5.2.2").type, "soft");
  assert.equal(classifyStatus("5.7.1").type, "soft");
  assert.equal(classifyStatus("4.2.0").type, "soft");
  assert.equal(classifyStatus("2.0.0").type, null);
});

test("Message-ID du CRM : campagne, séquence, et identifiants étrangers", () => {
  assert.deepEqual(parseCrmMessageId("<crm-abc123-lead456-B@exemple.fr>"), { kind: "campaign", campaignId: "abc123", leadId: "lead456", variant: "B" });
  assert.deepEqual(parseCrmMessageId("crm-seq-s1-l2-3@x.fr"), { kind: "sequence", sequenceId: "s1", leadId: "l2", stepIndex: 3 });
  assert.equal(parseCrmMessageId("<CAF=abc123@mail.example.com>"), null);
  assert.equal(parseCrmMessageId(null), null);
});

test("masquage des adresses dans les diagnostics", () => {
  assert.equal(maskEmails("550 <a.b@c.fr>: unknown"), "550 <<adresse masquée>>: unknown");
});
