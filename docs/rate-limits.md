# Rate limits

The app limits how fast one driver, or one client IP on the AI connector, can
use the parts that cost money or heavy work: the database, Clerk, the Google
Geocoding API, and image/PDF processing. The limits are well above normal use;
they're there to stop runaway AI loops, scripts and token guessing.

## Setup: run the migration

Run `src/lib/sql/2026-11-16-rate-limits.sql` once against the database. It adds
the `pt_rate_limits` table and an index; it's safe to run again.

The code works before the migration has run: the limiter can't count in the
database, logs `Rate limits: the pt_rate_limits table is missing` once per
server instance, and allows the request. Until then only a per-instance memory
limit applies, which on Vercel is weak (instances are many and short-lived).

## How it works

`src/lib/rate-limit` keeps a fixed-window counter per bucket, e.g.
`geocode:pat@example.com` or `mcp-auth-failures:203.0.113.7`. Each check is one
atomic upsert into `pt_rate_limits` that also deletes a few rows of windows that
have ended, so the table stays small without a scheduled job. Each server
instance also remembers buckets that are over their limit and refuses them
without touching the database until the window ends. If the database errors,
the request is allowed (fail open); the app never goes down because of the
limiter.

## The limits

All of them are in `src/lib/rate-limit/limits.ts`.

| Limit | Bucket | Allowed | Where |
| --- | --- | --- | --- |
| `MCP_AUTH_FAILURES` | client IP | 30 failed sign-ins per 10 minutes | `/api/mcp`: bad, revoked or expired API keys and access tokens. Over it, every request from that IP gets `429` with `Retry-After` until the window ends, even with a good token. |
| `MCP_TOOL_CALLS` | driver | 300 tool calls per 5 minutes | Every MCP tool call, across all the driver's AI apps. Over it, the tool answers a readable error. |
| `REPAIR_UPLOADS` | driver | 30 per hour | Recording a defect repair (invoice and signature upload), from the web app and the `mark_defect_repaired` tool together. |
| `GEOCODE` | driver | 60 per hour | `getAddress` (Google Geocoding). Over it, the address is left for the driver to type. |
| `SIGNATURES` | driver | 30 per hour | `saveSignature` and `signTrip`. |
| `TRIP_WRITES` | driver | 60 per hour | `addTrip` and `addOnRouteDefects` in the web app. |

Over a limit, server actions return their usual error with a message like
*"Too many requests in a short time. Please wait about 5 minutes and try
again."*

Not limited: reading pages, `undoDefectRepair`, `deleteSignature` (cheap, and
only the driver's own data), and emailing, which has its own limits.

The API key lookup on `/api/mcp` is a read; `last_used_at` is written only for a
real key, at most once a minute, so unknown keys never cause a write.

## Recommended on top: Vercel Firewall

The app's limits run inside the function, so a flood still starts functions. In
Vercel → Project → Firewall, add a rate-limit rule for path `/api/mcp`, e.g.
300 requests per minute per IP, action *Too Many Requests (429)*. Leave the
OAuth discovery paths (`/.well-known/...`) out of it.
