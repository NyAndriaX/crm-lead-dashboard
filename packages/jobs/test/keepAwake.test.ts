import { test } from "node:test";
import assert from "node:assert/strict";
import { inWindow, keepAwakeUrls, parseWindow } from "../src/keepAwake";

const TZ = "Indian/Antananarivo"; // UTC+3
const win = parseWindow("1-5 07:00-21:00");

test("plage horaire : jours ouvrés 7 h – 21 h, heure de Madagascar", () => {
  assert.equal(inWindow(new Date("2026-11-25T04:00:00Z"), win, TZ), true); // mercredi 07:00
  assert.equal(inWindow(new Date("2026-11-25T03:59:00Z"), win, TZ), false); // mercredi 06:59
  assert.equal(inWindow(new Date("2026-11-25T17:59:00Z"), win, TZ), true); // mercredi 20:59
  assert.equal(inWindow(new Date("2026-11-25T18:00:00Z"), win, TZ), false); // mercredi 21:00
  assert.equal(inWindow(new Date("2026-11-28T08:00:00Z"), win, TZ), false); // samedi 11:00
});

test("format de plage invalide", () => {
  assert.throws(() => parseWindow("lundi-vendredi"));
});

test("adresses : séparées par espaces ou virgules, http(s) uniquement", () => {
  assert.deepEqual(keepAwakeUrls({ KEEP_AWAKE_URLS: "https://a/x, https://b/y  ftp://c" }), ["https://a/x", "https://b/y"]);
  assert.deepEqual(keepAwakeUrls({}), []);
});
