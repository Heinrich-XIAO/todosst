import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const raw = (params.email as string) ?? "";
        const email = raw.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("invalid email");
        }
        return {
          email,
          name: email,
        };
      },
    }),
    // Sign in with (email, recovery-code verifier). The verifier is
    // sha256(PBKDF2(code, salt)) computed client-side — the server can verify
    // the account but cannot unwrap the vault (the raw key never leaves the client).
    ConvexCredentials({
      id: "recovery",
      authorize: async (params, ctx) => {
        const email = String(params.email ?? "").trim().toLowerCase();
        const verifier = String(params.verifier ?? "");
        if (!email || !verifier) throw new Error("Invalid credentials");
        const userId = await ctx.runQuery(internal.vault.internalUserIdByEmail, { email });
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
