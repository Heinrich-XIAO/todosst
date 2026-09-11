import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptPushPayload } from "../src/lib/pushCrypto";

// Web Push sender for the V8 runtime — no Node dependency. VAPID is an ES256
// JWT signed with WebCrypto. Reminder pushes carry client-encrypted copy blobs
// ({name, min} under the account's notification key) relayed unread; nudge
// pushes carry a tiny encrypted body ({t:"nudge"}). No plaintext titles, no
// counts of vault content, nothing readable ever leaves the client.

async function deliverToSubs(
  ctx: ActionCtx,
  publicKey: string,
  privateKey: string,
  subs: { endpoint: string; p256dh: string; auth: string }[],
  // per-subscription body (encrypted), or null for the empty-body generic push
  bodyFor: (s: { p256dh: string; auth: string }) => Promise<Uint8Array | null>
): Promise<{ delivered: number; retryable: number }> {
  let delivered = 0;
  let retryable = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        // aud must be the endpoint's origin, so each endpoint gets its own JWT
        const jwt = await vapidJwt(publicKey, privateKey, endpointOrigin(s.endpoint));
        const body = await bodyFor(s);
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            TTL: "3600",
            Authorization: `vapid t=${jwt}, k=${publicKey}`,
            ...(body ? { "Content-Encoding": "aes128gcm" } : {}),
          },
          ...(body ? { body: body as unknown as BodyInit } : {}),
        });
        // 201 = delivered, 429/5xx = retryable (next cron tick), 404/410 = gone
        if (res.status === 404 || res.status === 410) {
          await ctx.runMutation(internal.push.deleteSubscription, { endpoint: s.endpoint });
        } else if (res.ok) {
          delivered++;
        } else if (res.status === 429 || res.status >= 500) {
          retryable++;
        }
      } catch {
        // network error — retryable
        retryable++;
      }
    })
  );
  return { delivered, retryable };
}

export const sendPush = internalAction({
  args: { userId: v.string(), reminderIds: v.array(v.id("reminders")) },
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      // push not configured on this deployment — drop the rows so they don't
      // sit pending forever
      await ctx.runMutation(internal.push.markRemindersSent, { ids: args.reminderIds });
      return;
    }

    const subs = await ctx.runQuery(internal.push.subscriptionsFor, { userId: args.userId });
    if (subs.length === 0) {
      // nowhere to deliver — drop the rows (matches the old mark-first behavior)
      await ctx.runMutation(internal.push.markRemindersSent, { ids: args.reminderIds });
      return;
    }

    // Build the reminder payload from the client-encrypted blobs. aes128gcm is
    // single-record (4KB) so trim items until the outer JSON fits; anything
    // trimmed shows up as a "more" count in the service worker.
    const rows = await ctx.runQuery(internal.push.remindersFor, { ids: args.reminderIds });
    const blobs = rows
      .filter((r) => r.nt)
      .map((r) => ({ todoId: r.todoId, iv: r.nt!.iv, ct: r.nt!.ct }));
    let reminderPayload: string | null = null;
    if (blobs.length > 0) {
      const MAX_ITEMS = 10;
      const MAX_JSON = 3500; // encryptPushPayload caps plaintext at 4079 bytes
      let items = blobs.slice(0, MAX_ITEMS);
      let json = JSON.stringify({ t: "reminder", u: args.userId, items, more: Math.max(0, blobs.length - items.length) });
      while (json.length > MAX_JSON && items.length > 1) {
        items = items.slice(0, -1);
        json = JSON.stringify({ t: "reminder", u: args.userId, items, more: blobs.length - items.length });
      }
      if (json.length <= MAX_JSON) reminderPayload = json;
    }

    const { delivered, retryable } = await deliverToSubs(ctx, publicKey, privateKey, subs, async (s) => {
      if (!reminderPayload) return null;
      try {
        return await encryptPushPayload({ p256dh: s.p256dh, auth: s.auth }, reminderPayload);
      } catch {
        // per-subscription encryption failure — this device gets the generic copy
        return null;
      }
    });

    // mark delivered only when at least one subscription accepted, or when
    // nothing is retryable (all endpoints gone) — a total failure leaves the
    // rows unsent so the next cron tick retries
    if (delivered > 0 || retryable === 0) {
      await ctx.runMutation(internal.push.markRemindersSent, { ids: args.reminderIds });
    }
  },
});

// Daily-nudge push: fire and forget (the cron dedupes per day before
// scheduling). Carries the client-encrypted copy blob when one is stored —
// the service worker decrypts it on-device; a missing blob (or an encryption
// failure on a broken subscription) falls back to the generic nudge copy.
export const sendNudge = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return;
    const subs = await ctx.runQuery(internal.push.subscriptionsFor, { userId: args.userId });
    if (subs.length === 0) return;
    const { nb } = await ctx.runQuery(internal.nudge.forSend, { userId: args.userId });
    const payload = nb
      ? JSON.stringify({ t: "nudge", u: args.userId, nb })
      : JSON.stringify({ t: "nudge" });
    await deliverToSubs(ctx, publicKey, privateKey, subs, async (s) => {
      try {
        return await encryptPushPayload({ p256dh: s.p256dh, auth: s.auth }, payload);
      } catch {
        return null;
      }
    });
  },
});

function endpointOrigin(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    throw new Error("invalid push endpoint");
  }
}

// ---------- VAPID (RFC 8292) ----------

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
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Build a signed VAPID JWT for one push service. Keys are the standard
 * web-push format: public = base64url of the 65-byte uncompressed P-256
 * point, private = base64url of the 32-byte scalar.
 */
async function vapidJwt(publicKey: string, privateKey: string, audience: string): Promise<string> {
  const pub = b64urlDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("invalid VAPID public key");
  const priv = b64urlDecode(privateKey);
  if (priv.length !== 32) throw new Error("invalid VAPID private key");

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: b64urlEncode(priv),
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = b64urlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    utf8(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: "mailto:notifications@todosst.app",
      })
    )
  );
  const signingInput = utf8(`${header}.${claims}`);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    concat(signingInput, new Uint8Array(0)) as unknown as BufferSource
  );
  return `${header}.${claims}.${b64urlEncode(new Uint8Array(sig))}`;
}
