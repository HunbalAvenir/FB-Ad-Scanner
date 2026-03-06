# Meta Ads QA Scanner Portal

## Overview
Internal portal for managing Meta Ads quality assurance scanning across client ad accounts. Uses a structured rule engine to detect real ad issues across AI toggles, placement fit, creative integrity, and tracking. Routes findings to the correct team (Ops/AM/Media Buyer/Client).

## Architecture
- **Frontend**: React + TypeScript + Vite, Shadcn UI, TanStack Query, Wouter routing
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Tailwind CSS with dark mode support

## Data Model
- **clients**: Client profiles with access modes, BM IDs, allowed page/IG IDs, domains, policy fields (allowedAiEnhancements, requiredUtm, allowedAspectRatios)
- **meta_credentials**: System user tokens and user tokens with scopes, expiry tracking
- **ad_accounts**: Ad accounts with coverage flags (identity, creative, placement, delivery)
- **scan_issues**: Structured findings with ruleId, severity (blocker/high/medium/low), issueType (ai_toggle/placement_fit/creative_integrity/tracking/access), evidence (jsonb), recommendedFix, whyItMatters, adId/adsetId/campaignId, campaignObjective, status, routeTo
- **users**: Basic user table (auth not yet implemented)

## Scanner Rule Engine
Rules defined in `server/scanner.ts`:
- **AI Toggle** (AI_001-AI_005): Detects Advantage Creative Enhancements, Image Expansion, Auto Text, Auto Music/Filters, policy violations
- **Placement Fit** (ASPECT_001-ASPECT_004): 9:16 in feed (blocker), square in stories (high), missing placement assets (high), extreme crop risk (medium)
- **Creative Integrity** (CREATIVE_001-CREATIVE_004): Missing CTA, unapproved domain, wrong page, missing video thumbnail
- **Tracking** (TRACK_001-TRACK_002): Missing UTM parameters, invalid pixel
- **Access** (ACCESS_001): Token/permission failures

Scanner clears old issues per account before each scan via `storage.deleteIssuesByAdAccount()`.

## Key Pages
- `/` - Dashboard with stats (blockers/high/medium counts), degraded accounts, recent issues, client overview
- `/clients` - Client list with add client dialog
- `/clients/:id` - Client detail with tabs: Accounts (per-account scan + URL audit buttons), Credentials, Issues (with Ads Manager links, preview links, recommendedFix), Onboarding
- `/ad-accounts` - All ad accounts with coverage visualization
- `/issues` - Issue tracker with Open/In Progress/Closed tabs, severity badges, rule IDs, evidence, Ads Manager deep links, filters (severity/type/rule/client/objective), bulk actions ("Resolve All"/"Dismiss All" for same rule), reopen resolved issues
- `/credentials` - All credentials with scope and expiry info

## Meta API Integration
- `server/meta-api.ts` - Graph API v21.0 client with expanded fields: creative details (object_story_spec, asset_feed_spec, image_url, video_id, call_to_action_type, link_url, instagram_actor_id), placement targeting, tracking_specs, image metadata extraction
- `server/scanner.ts` - Structured rule engine with Finding interface
- Token resolution: META_SYSTEM_USER_TOKEN env var as fallback for system_user_token credentials
- Ad account IDs auto-prefixed with `act_`
- Scan routes: `POST /api/scan/all`, `POST /api/scan/account/:id`, `POST /api/validate-token`
- URL audit route: `GET /api/ad-accounts/:id/urls` — returns all destination URLs found in the account's ads with domain, UTM parameters, and Ads Manager links
- Issues store `previewUrl` from Meta's `preview_shareable_link` field
- Ads Manager deep links use format: `https://www.facebook.com/adsmanager/manage/{type}?act={actNum}&selected_{type}_ids={id}`
- URL audit extracts URLs from: link_url, link_data, video_data, carousel child_attachments, asset_feed_spec.link_urls, and shared_post (via effective_object_story_id)
- Creative url_tags field fetched from Meta API for UTM tracking on shared post ads

## Key Files
- `shared/schema.ts` - All Drizzle schemas and Zod validators
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface with deleteIssuesByAdAccount, getDashboardStats (blocker/high/medium counts), bulkUpdateIssues, bulkUpdateIssuesByRule
- `server/routes.ts` - REST API routes
- `server/meta-api.ts` - Meta Marketing API client with getImageMetadata helper
- `server/scanner.ts` - Rule engine scanner (AI, Placement, Creative, Tracking rules)
- `server/seed.ts` - Seed data for 5 clients, credentials, ad accounts, issues (uses new schema)
- `client/src/App.tsx` - Root with sidebar layout, theme provider, routing
- `client/src/components/` - Shared components (sidebar, theme, StatusBadge with blocker/high/medium/low, coverage widget)
- `client/src/pages/` - Page components (dashboard, clients, client-detail with AdAccountCard + scan button, ad-accounts, issues, credentials)

## Environment Secrets
- META_APP_ID, META_APP_SECRET - App credentials
- META_SYSTEM_USER_TOKEN - System user token for API access
- SESSION_SECRET - Session management

## Running
- `npm run dev` starts both Express backend and Vite frontend on port 5000
- `npm run db:push` syncs schema to database
