export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://example.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
