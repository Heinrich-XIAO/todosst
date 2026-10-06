# Git

- When you commit, also push so the branch stays up to date.
- Prefer suggesting commit + push by itself rather than deploying by itself, because deploying feels scarier / higher-stakes.
- Don't automatically commit + push every time. Instead, judge whether it's probably a good idea and the user would most likely be confident in it.
- If you are confident you understand what the user wants and why, auto-commit and push (then report it).
- If you are not confident you understand what the user wants and why, only suggest commit + push and wait for confirmation instead of auto-doing it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
