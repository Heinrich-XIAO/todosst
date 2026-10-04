import { ConvexError } from "convex/values";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { Scrypt } from "lucia";

// Usernames are the only account identifier: 3-64 chars, lowercased,
// letters/digits/dot/underscore/hyphen. The account password is the sign-in
// credential only — it no longer derives any data key.
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
        if (!USERNAME_PATTERN.test(username)) throw new ConvexError("invalid username");
        const secret = params.password;
        if (flow === "signUp") {
          if (typeof secret !== "string" || secret.length < 8 || secret.length > 128) {
            throw new ConvexError("invalid password");
          }
          const created = await createAccount(ctx, {
            provider: "password",
            account: { id: username, secret },
            profile: { name: username },
            shouldLinkViaPhone: false,
          });
          return { userId: created.user._id };
        }
        if (flow === "signIn") {
          if (typeof secret !== "string" || !secret) throw new ConvexError("Invalid credentials");
          let retrieved: Awaited<ReturnType<typeof retrieveAccount>> | null = null;
          try {
            retrieved = await retrieveAccount(ctx, {
              provider: "password",
              account: { id: username, secret },
            });
          } catch {
            // "InvalidAccountId" / "InvalidSecret" / "TooManyFailedAttempts" —
            // plain Errors would be redacted to an opaque server error in prod
            throw new ConvexError("Invalid credentials");
          }
          if (!retrieved || !retrieved.user) throw new ConvexError("Invalid credentials");
          return { userId: retrieved.user._id };
        }
        throw new ConvexError("Missing `flow` param, it must be one of \"signUp\" or \"signIn\"");
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
  ],
});
