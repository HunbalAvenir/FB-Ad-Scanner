# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Meta Ads QA Scanner Portal: an internal, read-only tool for an ad agency. It pulls ads from client Meta ad accounts through the Graph API (v21.0), runs a rule engine over each ad and stores the findings as issues routed to a team (ops / account manager / buyer / client). It never writes to Meta. The app was built on Replit, which still hosts it and deploys from `main`. Product requirements live in `attached_assets/Pasted-*.txt` (the main PRD plus an access-model addendum). `replit.md` is Replit Agent's own running summary of the app.

## Commands

There is no test suite and no linter. `npm run check` (`tsc`, no emit) is the only automated check.

Local development on Windows (scripts read `.env`; see `.env.example`):
- `npm run dev:local` starts the dev server on http://localhost:5000
- `npm run db:push:local` syncs `shared/schema.ts` to the database

On Replit/Linux (env comes from Replit Secrets and the managed DB):
- `npm run dev`, `npm run db:push`
- `npm run build` then `npm start` for production (`dist/index.cjs` + `dist/public`)

The plain `dev`/`start` scripts use `NODE_ENV=...` prefixes, which don't work in Windows shells, and nothing loads `.env` except the `:local` scripts (via Node's `--env-file`). Keep `reusePort` off on Windows in `server/index.ts`, because Windows doesn't support it (`listen ENOTSUP`).

Env vars: `DATABASE_URL` (required, the server throws at import without it), `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `SESSION_SECRET`, `PORT`, plus the auth/email ones: `SUPER_ADMIN_INITIAL_PASSWORD`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` (see `.env.example`).

## Architecture

One Express process (`server/index.ts`) serves both the REST API and the React client on one port. In development, Vite runs as middleware (`server/vite.ts`). In production, built static files are served (`server/static.ts`). Startup order: `seedDatabase()` → `registerRoutes()` → Vite/static → listen. The seed (`server/seed.ts`) inserts 5 demo clients with fake account IDs whenever the `clients` table is empty, so a fresh DB always shows demo data, and scanning those accounts fails with access errors.

Schema changes go in `shared/schema.ts` (Drizzle tables plus `drizzle-zod` insert schemas, which the routes use for validation) and are applied with `db:push`. There are no migration files. Tables reference each other only through integer columns, with no foreign keys or cascades, so deletes don't cascade.

Auth (`server/auth.ts`) mirrors the sibling Audit-Wizard (AdIQ) tool: email + password (scrypt), roles `super_admin` / `user`, no public sign-up. `SUPER_ADMIN_EMAILS` are recreated as super admins on every startup. Invites and password resets share one flow: a sha256-hashed one-time token on the user row, landing on `/reset-password?token=`. Emails go through Resend (`server/email.ts`). Without email configured, admins set a temporary password or copy an invite link instead. Sessions are express-session stored in the Postgres `sessions` table (connect-pg-simple), with `userId` in the session. `ensureAuthTables()` creates `users`/`sessions` with raw SQL at startup (deploys don't run `db:push`), so if you change those two tables in `shared/schema.ts`, update that SQL to match and check that `db:push` reports no changes. The same session also holds the Facebook OAuth user token used for importing accounts. `registerAuthRoutes()` registers the public `/api/auth/*` routes and then `app.use("/api", requireAuth)`, so every route registered after it (everything in `routes.ts`) requires sign-in, and `/api/users` additionally requires a super admin. On the client, `AuthGate` in `App.tsx` shows the login screen when `/api/auth/user` returns no user, and any 401 clears that cached user.

Server layers:
- `server/routes.ts`: all other `/api/*` routes, thin handlers over `storage`. The passport dependencies are unused.
- `server/storage.ts`: the `IStorage` interface implemented by `DatabaseStorage` (Drizzle). All DB access goes through `storage`.
- `server/meta-api.ts`: Graph API fetch helpers (`metaFetch`, `smokeTestAdAccount`, `getAds`/`getAdSets`/`getCampaigns`, pages/IG accounts). It also contains `getImageMetadata`, which downloads a creative image and reads the pixel size from the PNG/JPEG header bytes. Only `listAdAccounts` follows paging. The other fetches return just the first page (limit 100).
- `server/scanner.ts`: the rule engine.

Scan pipeline (`scanAdAccount`):
1. Resolve a token. If the client has no active credential, a synthetic credential with `id: 0` is built from `META_SYSTEM_USER_TOKEN`. `resolveToken` always prefers that env var for `system_user_token` credentials. For other credential types it returns `credential.tokenOwner`, which in practice holds a label, not a token.
2. Smoke-test the account. On failure, mark the account `degraded`, possibly mark the credential `expired`, and create an `ACCESS_001` issue.
3. Fetch ads, ad sets, campaigns, pages and IG accounts in parallel, and update the account's coverage flags.
4. For each ACTIVE/PAUSED ad, run `checkAiToggles`, `checkPlacementFit`, `checkCreativeIntegrity` and `checkTracking`. Each returns `Finding[]` with `ruleId`, `severity`, `evidence`, `recommendedFix` and so on.
5. `storage.deleteIssuesByAdAccount()` wipes **all** issues for the account, including resolved and dismissed ones, then the findings are inserted with `status: "open"`, `routeTo: "buyer"`.

Adding a rule: push a `Finding` from the matching `check*` function, using a new rule ID in the existing `AI_` / `ASPECT_` / `CREATIVE_` / `TRACK_` / `ACCESS_` families. The `issueType` must be one of the enum values in `scanIssues`. Client policy fields (`allowedDomains`, `allowedPageIds`, `allowedIgActorIds`, `allowedAiEnhancements`, `requiredUtm`) on the `Client` are what make rules client-specific. Update the rule list in `replit.md` too, since that file documents the rule catalogue.

`auditAccountUrls` (the URLs tab) is separate from scanning. It extracts destination URLs and UTM params from every creative shape (link_data, video_data, carousel children, asset_feed_spec, shared posts with `url_tags`) without creating issues.

Client (`client/src`, React 18 + Vite + wouter + TanStack Query + shadcn/ui in `components/ui`):
- The default `queryFn` in `lib/queryClient.ts` fetches `queryKey.join("/")`. Query keys therefore *are* URL segments, e.g. `["/api/clients", id, "ad-accounts"]`, and mutations invalidate by the same keys. Writes go through `apiRequest(method, url, body)`. `staleTime` is `Infinity` and retries are off, so data only refreshes through explicit invalidation.
- Routes are in `App.tsx`. Most of the UI lives in `pages/client-detail.tsx` (~1700 lines: Accounts / URLs / Scan / Credentials / Issues / Onboarding tabs, which share filter state through `SharedFilterBar`) and `pages/clients.tsx` (Facebook JS SDK login plus bulk import).
- Path aliases: `@/` → `client/src`, `@shared/` → `shared`, `@assets/` → `attached_assets`.
