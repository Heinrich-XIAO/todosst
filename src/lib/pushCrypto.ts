// Web Push payload encryption — RFC 8291 "aes128gcm", application-server side.
// The push action uses this to send a small typed JSON body ({t:"nudge"}) so
// the service worker can render type-specific copy. The push service still
// sees only ciphertext; the payload reveals nothing about vault content.
// Correctness is pinned to the RFC 8291 section 5 test vector (pushCrypto.test.ts).

export type PushSubKeys = { p256dh: string; auth: string };

const RS = 4096; // single-record messages; header (86) + plaintext + tag must fit

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as unknown as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as unknown as BufferSource, info: info as unknown as BufferSource },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt one push message for one subscription. Returns the aes128gcm body:
 * salt(16) || rs(4 BE) || idlen(1) || as_public(65) || ciphertext.
 * `opts` injects a fixed salt / keypair for the RFC test vector.
 */
export async function encryptPushPayload(
  keys: PushSubKeys,
  plaintext: string,
  opts?: { salt?: Uint8Array; asKeys?: CryptoKeyPair }
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(keys.p256dh);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error("invalid subscription p256dh key");
  const authSecret = b64urlDecode(keys.auth);
  if (authSecret.length !== 16) throw new Error("invalid subscription auth secret");

  const asKeys =
    opts?.asKeys ??
    (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"] as KeyUsage[]));
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeys.privateKey, 256)
  );

  // RFC 8291 section 3.3/3.4: combine ECDH secret with the auth secret
  const keyInfo = concat(utf8("WebPush: info"), concat(new Uint8Array(1), concat(uaPublic, asPublicRaw)));
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);

  const salt = opts?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\x00"), 12);

  // single record, last-record delimiter 0x02, no extra padding (RFC 8188)
  const record = concat(utf8(plaintext), new Uint8Array([0x02]));
  if (record.length > RS - 17) throw new Error("push payload too large");
  const cekKey = await crypto.subtle.importKey("raw", cek as unknown as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as unknown as BufferSource }, cekKey, record as unknown as BufferSource)
  );

  // header: salt(16) || rs(4 BE) || idlen(1) || as public key (65 bytes)
  const header = new Uint8Array(21 + asPublicRaw.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RS);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);
  return concat(header, ct);
}
