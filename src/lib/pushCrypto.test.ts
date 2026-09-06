import { test, expect } from "bun:test";
import { encryptPushPayload } from "./pushCrypto";

// RFC 8291 section 5 worked example — ground truth for the aes128gcm format.
// The receiver keypair + auth secret let the test decrypt independently of the
// encrypt implementation (manual HMAC-HKDF below, per the RFC pseudocode).
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  expectedBody:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key as unknown as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as unknown as BufferSource));
}

async function importEcdhPrivate(rawPriv: Uint8Array, rawPub: Uint8Array): Promise<CryptoKeyPair> {
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(rawPub.slice(1, 33)),
    y: b64urlEncode(rawPub.slice(33, 65)),
    d: b64urlEncode(rawPriv),
  };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey(
    "raw",
    rawPub as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
  return { privateKey, publicKey };
}

/** RFC 8291 + 8188 receiver side, built from the RFC pseudocode only. */
async function uaDecrypt(uaPrivate: CryptoKey, body: Uint8Array): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);

  const asPublicKey = await crypto.subtle.importKey(
    "raw",
    asPublic as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ecdhSecret = await hmacReadyEcdh(uaPrivate, asPublicKey);
  const authSecret = b64urlDecode(RFC.authSecret);

  // PRK_key = HMAC-SHA-256(auth_secret, ecdh_secret)          [HKDF-Extract]
  const prkKey = await hmac(authSecret, ecdhSecret);
  // IKM = HMAC-SHA-256(PRK_key, "WebPush: info" || 0x00 || ua_public || as_public || 0x01)
  const keyInfo = concat(utf8("WebPush: info"), new Uint8Array(1), b64urlDecode(RFC.uaPublic), asPublic, new Uint8Array([0x01]));
  const ikm = await hmac(prkKey, keyInfo);
  // PRK = HMAC-SHA-256(salt, IKM)
  const prk = await hmac(salt, ikm);
  // CEK = HMAC-SHA-256(PRK, "Content-Encoding: aes128gcm" || 0x00 || 0x01)[0..15]
  const cek16 = (await hmac(prk, concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0x00, 0x01])))).slice(0, 16);
  // NONCE = HMAC-SHA-256(PRK, "Content-Encoding: nonce" || 0x00 || 0x01)[0..11]
  const nonce = (await hmac(prk, concat(utf8("Content-Encoding: nonce"), new Uint8Array([0x00, 0x01])))).slice(0, 12);

  const key = await crypto.subtle.importKey("raw", cek16 as unknown as BufferSource, "AES-GCM", false, ["decrypt"]);
  // aes128gcm AAD is empty (RFC 8188 section 2)
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as unknown as BufferSource }, key, ct as unknown as BufferSource));
  // last non-zero octet must be the last-record delimiter 0x02
  let idx = plain.length - 1;
  while (idx >= 0 && plain[idx] === 0) idx--;
  expect(idx).toBeGreaterThanOrEqual(0);
  expect(plain[idx]).toBe(0x02);
  return plain.slice(0, idx);
}

async function hmacReadyEcdh(uaPrivate: CryptoKey, asPublicKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asPublicKey }, uaPrivate, 256));
}

test("encryptPushPayload matches RFC 8291 section 5 vector", async () => {
  const asKeys = await importEcdhPrivate(b64urlDecode(RFC.asPrivate), b64urlDecode(RFC.asPublic));
  const body = await encryptPushPayload(
    { p256dh: RFC.uaPublic, auth: RFC.authSecret },
    RFC.plaintext,
    { salt: b64urlDecode(RFC.salt), asKeys }
  );
  expect(b64urlEncode(body)).toBe(RFC.expectedBody);
});

test("fresh random encryption decrypts with the receiver keys", async () => {
  const uaKeys = await importEcdhPrivate(b64urlDecode(RFC.uaPrivate), b64urlDecode(RFC.uaPublic));
  const msg = JSON.stringify({ t: "nudge" });
  const body = await encryptPushPayload({ p256dh: RFC.uaPublic, auth: RFC.authSecret }, msg);
  // header sanity: rs = 4096 big-endian at offset 16, idlen 65
  expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
  expect(body[20]).toBe(65);
  const plain = await uaDecrypt(uaKeys.privateKey, body);
  expect(new TextDecoder().decode(plain)).toBe(msg);
});

test("rejects malformed subscription keys", async () => {
  await expect(encryptPushPayload({ p256dh: "AAAA", auth: RFC.authSecret }, "x")).rejects.toThrow("p256dh");
  await expect(encryptPushPayload({ p256dh: RFC.uaPublic, auth: "AAAA" }, "x")).rejects.toThrow("auth");
});
