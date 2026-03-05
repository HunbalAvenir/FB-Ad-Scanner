# Meta Ads QA Scanner Portal

## Overview
Internal portal for managing Meta Ads quality assurance scanning across client ad accounts. Supports multiple access methods (Partner, User Token, Public), credential management, ad account coverage tracking, and issue routing.

## Architecture
- **Frontend**: React + TypeScript + Vite, Shadcn UI, TanStack Query, Wouter routing
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support

## Data Model
- **clients**: Client profiles with access modes, BM IDs, allowed page/IG IDs, domains
- **meta_credentials**: System user tokens and user tokens with scopes, expiry tracking
- **ad_accounts**: Ad accounts with coverage flags (identity, creative, placement, delivery)
- **scan_issues**: Issues with severity, type, status, and routing (ops/AM/buyer/client)
- **users**: Basic user table (auth not yet implemented)

## Key Pages
- `/` - Dashboard with stats, degraded accounts, recent issues, client overview
- `/clients` - Client list with add client dialog
- `/clients/:id` - Client detail with tabs: Accounts, Credentials, Issues, Onboarding
- `/ad-accounts` - All ad accounts with coverage visualization
- `/issues` - Issue tracker with Open/In Progress/Closed tabs
- `/credentials` - All credentials with scope and expiry info

## Meta API Integration
- `server/meta-api.ts` - Graph API v21.0 client (validateToken, smokeTest, getAds, getAdSets, getAdCreatives, getCampaigns, getAccountPages)
- `server/scanner.ts` - Issue detection logic (disapproved ads, missing geo, domain mismatches, UTM checks, identity/page ID checks)
- App credentials stored as secrets: META_APP_ID, META_APP_SECRET
- App access token generated as `${appId}|${appSecret}`
- User tokens stored in `meta_credentials.tokenOwner` field (design shortcut)
- Scan routes: `POST /api/scan/all`, `POST /api/scan/account/:id`, `POST /api/validate-token`

## Key Files
- `shared/schema.ts` - All Drizzle schemas and Zod validators
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and DatabaseStorage implementation
- `server/routes.ts` - REST API routes
- `server/meta-api.ts` - Meta Marketing API client
- `server/scanner.ts` - Scanner with issue detection logic
- `server/seed.ts` - Seed data for 5 clients, credentials, ad accounts, issues
- `client/src/App.tsx` - Root with sidebar layout, theme provider, routing
- `client/src/components/` - Shared components (sidebar, theme, status badges, coverage widget)
- `client/src/pages/` - Page components (dashboard, clients, client-detail with AdAccountCard, ad-accounts, issues, credentials)

## Running
- `npm run dev` starts both Express backend and Vite frontend on port 5000
- `npm run db:push` syncs schema to database
