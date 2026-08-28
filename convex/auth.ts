import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";

// Usernames are the only account identifier: 3-64 chars, lowercased,
// letters/digits/dot/underscore/hyphen.
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Username + password. Account id is the plain username; passwords are
    // scrypt-hashed by lucia, same scheme as the previous email/password flow.
    ConvexCredentials({
      id: "password",
      authorize: async (params, ctx) => {
        const flow = String(params.flow ?? "");
        const username = String(params.username ?? "").trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) throw new Error("invalid username");
        const secret = params.password;
        if (flow === "signUp") {
          if (typeof secret !== "string" || secret.length < 8 || secret.length > 128) {
            throw new Error("invalid password");
          }
          const created = await createAccount(ctx, {
            provider: "password",
            account: { id: username, secret },
            profile: { name: username },
            shouldLinkViaEmail: false,
            shouldLinkViaPhone: false,
          });
          return { userId: created.user._id };
        }
        if (flow === "signIn") {
          if (typeof secret !== "string" || !secret) throw new Error("Invalid credentials");
          const retrieved = await retrieveAccount(ctx, {
            provider: "password",
            account: { id: username, secret },
          });
          if (!retrieved || !retrieved.user) throw new Error("Invalid credentials");
          return { userId: retrieved.user._id };
        }
        throw new Error("Missing `flow` param, it must be one of \"signUp\" or \"signIn\"");
      },
      crypto: {
        async hashSecret(password) {
          return await new Scrypt().hash(password);
        },
        async verifySecret(password, hash) {
          return await new Scrypt().verify(hash, password);
        },
      },
    }),
    // Sign in with (username, recovery-code verifier). The verifier is
    // sha256(PBKDF2(code, salt)) computed client-side — the server can verify
    // the account but cannot unwrap the vault (the raw key never leaves the client).
    ConvexCredentials({
      id: "recovery",
      authorize: async (params, ctx) => {
        const username = String(params.username ?? "").trim().toLowerCase();
        const verifier = String(params.verifier ?? "");
        if (!username || !verifier) throw new Error("Invalid credentials");
        const userId = await ctx.runQuery(internal.vault.internalUserIdByUsername, { username });
        if (!userId) throw new Error("Invalid credentials");
        const stored = await ctx.runQuery(internal.vault.internalGetVerifier, { userId });
        if (!stored || stored !== verifier) throw new Error("Invalid credentials");
        // single-use grant allowing one password change without the current password
        await ctx.runMutation(internal.vault.internalCreateGrant, { userId });
        return { userId };
      },
    }),
  ],
});
