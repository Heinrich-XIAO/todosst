import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { sha256Hex } from "./unlockKeys";

const http = httpRouter();

auth.addHttpRoutes(http);

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function cors(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

// StopScrll unlock API. Both routes take `Authorization: Bearer <key>` where
// the key is a `tsst_…` unlock key issued from settings.
http.route({
  path: "/unlock/tasks",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

http.route({
  path: "/unlock/tasks",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const raw = bearer(req);
    if (!raw) return cors(401, { error: "missing bearer key" });
    const userId = await ctx.runQuery(internal.unlockKeys.userIdForTokenHash, {
      tokenHash: await sha256Hex(raw),
    });
    if (!userId) return cors(401, { error: "invalid key" });
    const tasks = await ctx.runQuery(internal.unlockKeys.openTasks, { userId });
    return cors(200, { tasks });
  }),
});

http.route({
  path: "/unlock/complete",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

http.route({
  path: "/unlock/complete",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = bearer(req);
    if (!raw) return cors(401, { error: "missing bearer key" });
    const tokenHash = await sha256Hex(raw);
    const userId = await ctx.runQuery(internal.unlockKeys.userIdForTokenHash, { tokenHash });
    if (!userId) return cors(401, { error: "invalid key" });
    let id: string = "";
    try {
      const body = (await req.json()) as { id?: unknown };
      if (typeof body.id === "string") id = body.id;
    } catch {
      return cors(400, { error: "invalid json" });
    }
    if (!id) return cors(400, { error: "missing id" });
    const result = await ctx.runMutation(internal.unlockKeys.completeTask, { userId, id });
    if (!result.ok) return cors(409, result);
    await ctx.runMutation(internal.unlockKeys.touchToken, { tokenHash });
    return cors(200, result);
  }),
});

export default http;
