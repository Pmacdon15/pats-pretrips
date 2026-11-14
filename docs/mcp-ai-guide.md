# Using Pat's PreTrips from an AI assistant

PreTrips has an MCP server at **`https://patspretrips.ca/api/mcp`**. Connect it to Claude, Muse, Gemini or any other app that supports MCP connectors. Then send the assistant a photo of the odometer and the truck's licence plate, tell it the make and model, and it starts your pre-trip for you. It can also update a trip from the last 24 hours, like a new odometer reading or a defect you found on route.

The rules below are sent to every assistant automatically when it connects (the server's MCP `instructions`, in `src/mcp/instructions.ts`), so you don't need to paste anything.

## Connecting

1. In your AI app, add a custom connector with the URL `https://patspretrips.ca/api/mcp`.
2. When it asks, sign in with your PreTrips account (Clerk, the same sign-in as the website). The assistant only ever sees your own trips.
3. Send it your photos, e.g. *"Start my pre-trip"* with a picture of the dash and one of the plate.

The **Connect AI** page (`/connect`) is static: just the URL and these steps. The server still accepts existing personal API keys (`Authorization: Bearer ppt_…`), but there is no page to create or revoke them.

### Setting up sign-in (once, in Clerk)

PreTrips signs in with Clerk, like Budget and Clock Out. Clerk registers AI apps by itself, as long as it's switched on:

- **Claude, ChatGPT and other apps that register themselves**: in the Clerk dashboard for PreTrips, go to **Configure → OAuth applications** and turn on **Dynamic client registration**. That's all: the AI app finds Clerk through `/.well-known/oauth-protected-resource/api/mcp`, registers, and sends the driver to sign in.
- **Apps that ask for a Client ID (Muse, sometimes Gemini)**: in **OAuth applications**, add an application for that app, add its callback URL (Gemini's looks like `https://oauth-redirect.googleusercontent.com/r/...`), turn on PKCE (public client) or keep the secret for apps that ask for one, and give the app the Client ID with `https://patspretrips.ca/api/mcp` as the server URL.
- **Default scopes:** some clients (Clerk names Claude and ChatGPT) may leave out `scope` when they send the driver to sign in, and then Clerk gives the token the instance's default scopes. In **OAuth applications → Settings → Client onboarding**, set **Default scopes for dynamic clients** to `profile email offline_access`. The server refuses OAuth tokens without `email` (see below).
- **Token audience (recommended):** see [Binding tokens to PreTrips](#binding-tokens-to-pretrips).

The issuer AI apps are told about is the Clerk Frontend API from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (e.g. `https://clerk.patspretrips.ca`); set `MCP_OAUTH_ISSUER` to override it. Access tokens are checked with Clerk's Backend API (`CLERK_SECRET_KEY`), and the driver's email is their Clerk primary email. Ask for the scopes `profile email offline_access` (not `openid`: Clerk rejects a dynamic client registration that asks for it, as Muse found); `offline_access` gets the refresh token that keeps the connector signed in (Gemini needs it).

**Scopes the server requires.** An OAuth access token must carry the `email` scope (`REQUIRED_OAUTH_SCOPES` in `src/mcp/auth.ts`), because tools act as the driver's email and the driver has to have agreed to share it with that app. A token without it gets the normal `401 invalid_token`, so the client signs in again asking for the advertised scopes; the log line `MCP: refused an access token for client … without the email scope (it has: …)` shows which app and what it was granted. `profile` isn't required. Personal API keys (`ppt_…`) have no scopes and aren't affected.

### Binding tokens to PreTrips

Without an audience check, any OAuth access token Clerk issued for the driver is accepted, whichever app it was issued to, and with dynamic client registration on anyone can register an app. To bind tokens to this server:

1. In the Clerk dashboard (production instance), open **Agents → MCP servers**, select **Add MCP server** (or **Get started**), enter `https://patspretrips.ca/api/mcp` as the **MCP URL** exactly (no trailing slash) and save. Per Clerk's docs, adding the first MCP server turns on audience claims (`aud`) in access tokens, and Clerk's own MCP guide then checks that `aud` includes that URL. Fix anything the dashboard's connection test reports.
2. Reconnect one AI app (or wait for one to refresh its token), then look in the Vercel logs for the line `MCP: MCP_TOKEN_AUDIENCE is unset, … (this token's aud: …)`. It appears once per server instance in production. When it shows `["https://patspretrips.ca/api/mcp"]`, the value is confirmed. If it still says `none`, audience claims aren't on yet: don't set the variable.
3. In Vercel → Project → Settings → Environment Variables, set `MCP_TOKEN_AUDIENCE=https://patspretrips.ca/api/mcp` for Production and redeploy. From then on a token whose `aud` doesn't include that URL, or that has no `aud`, is refused with `401 invalid_token`, so apps holding tokens from before step 1 have to sign in again.

What isn't confirmed: whether Clerk takes `aud` from the `resource` parameter clients send (RFC 8707) or from the MCP servers list, and whether refresh tokens issued before step 1 come back with an `aud`. That's why the server doesn't enforce the audience until `MCP_TOKEN_AUDIENCE` is set, and why step 2 checks the real value first.

### Production instance

Clerk's production instance runs on `patspretrips.ca`. The DNS is on Vercel, which already has:

| Name | Type | Value |
| --- | --- | --- |
| `clerk` | CNAME | `frontend-api.clerk.services` |
| `accounts` | CNAME | `accounts.clerk.services` |

Clerk also lists three email records (`clkmail`, `clk._domainkey`, `clk2._domainkey`) whose values are specific to the instance. Add them in Vercel from the Clerk dashboard's **Domains** page, then deploy the certificates there. Use the production keys (`pk_live_…`, `sk_live_…`) in Vercel's Production environment; the Connect AI issuer is then `https://clerk.patspretrips.ca`.

### Database

Run `src/lib/sql/2026-11-12-ai-connector.sql` once against the database. It adds the `pt_api_keys` table and an index; it's safe to run again. For defect repairs, also run `src/lib/sql/2026-11-13-defect-repairs.sql` (the `pt_defect_repairs` table), then `src/lib/sql/2026-11-14-repair-shop-or-mechanic.sql`. For signed pre-trips, run `src/lib/sql/2026-11-15-pretrip-signatures.sql` (the `pt_driver_signatures` and `pt_trip_signatures` tables and `PTTrips.signed_at`). (Don't run `makeDb.sql`: it drops the trips table.)

## The rules

1. **Read the photos.** The assistant reads the odometer (whole kilometres, without the tenths digit), the truck plate and any trailer plates, and the make and model from a badge or from you. It never guesses a digit it can't read.
2. **Look up the defaults.** `get_trip_defaults` with the plate gives the carrier, carrier address and inspection address from your last trip and, if you've driven that truck before, its make, model, trailers and last odometer.
3. **Confirm the whole trip with you.** For example: *"Start a pre-trip: Freightliner Cascadia, plate ABC 1234, 482,317 km, carrier Acme Freight (12 Depot Rd), inspected at 455 Yard Ave, no defects. OK?"* It always asks where you're inspecting and whether you found defects. Nothing is saved until you say OK.
4. **`start_trip` saves it.** Defects use the app's names (`list_defect_categories`). Remarks are required: your words, or "No defects found".
5. **Signed with your saved signature.** Save your signature once on the website's **Signature** page (`/signature`), or tick "Save my signature" the first time you sign a pre-trip there. Every trip the assistant starts is then signed with it: saying OK to the trip is your sign-off. `get_trip_defaults` tells the assistant whether you have one. Without one the trip is saved unsigned; sign it later on the trip's page, or save a signature and ask the assistant to sign it (`update_trip` with `sign: true`). Each trip keeps a copy, so changing your saved signature never changes a signed trip.
6. **Odometer going backwards?** If the reading is lower than the truck's last one, the assistant gets a warning and checks the photo with you.
7. **Updates for 24 hours.** `update_trip` changes only the fields you pass. Defects and remarks are only added to, never removed. Trips older than 24 hours can't be changed, same as on the website.
8. **Repairs, any time.** When a defect is fixed (say a mechanic replaced a tire), `mark_defect_repaired` records who fixed it, the invoice number and date, a compressed copy of the invoice and the mechanic's signature. The trip still shows the defect as found; the repair sits beside it, so `list_defects` (and the website's **Defects** page) shows a clear record of what's open and what was fixed. `undo_defect_repair` reopens one recorded by mistake.

## Tools

| Tool | What it does | Changes data? |
| --- | --- | --- |
| `list_defect_categories` | The defect names PreTrips uses | No |
| `get_trip_defaults` | Suggestions for a new trip from your last trip and, with `truck_plate`, that truck's make, model, trailers and last odometer, and whether you have a saved signature (`saved_signature`) | No |
| `start_trip` | Saves a new pre-trip: `odometer`, `make`, `model`, `carrier`, `carrier_address`, `inspection_address`, `remarks`, optional `truck_plate`, `trailer_plate_a`, `trailer_plate_b`, `defects`, `sign` (default `true`: signs with your saved signature) | Yes |
| `update_trip` | Changes a trip from the last 24 hours: `trip_id` plus only what changes; `add_defects` and `add_remarks` add on-route defects; `sign: true` signs an unsigned trip with your saved signature | Yes |
| `list_trips` | Your trips, 10 per page: `when` is `current` (last 24 hours) or `past` | No |
| `get_trip` | One trip by `trip_id`, with each defect open or repaired | No |
| `list_defects` | Your defect record: `status` is `open`, `repaired` or `all`; optional `truck_plate` | No |
| `mark_defect_repaired` | Marks a trip's defect fixed: `trip_id`, `defect`, `mechanic_name` and/or `shop_name` (at least one), optional `invoice_number`, `repaired_on`, `notes`, `invoice_base64` (PDF or photo, compressed before saving), `signature_base64` | Yes |
| `undo_defect_repair` | Removes a repair by `repair_id`, so the defect is open again | Yes |

In AI apps that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps) (Claude, ChatGPT and others), `list_trips` and `get_trip` also show their result as a trips card in the chat: each trip's truck, plates, odometer, defects and remarks, with a link to open it in PreTrips. The card is the `ui://pats-pretrips/trips-card.html` resource (`src/mcp/trips-card.ts`); apps without MCP Apps just read the text answer.

## How it's built

The same way as Budget and Clock Out: `src/app/api/mcp/route.ts` runs [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) (Streamable HTTP, stateless) behind `src/mcp/http.ts`, which handles CORS, case-insensitive `Bearer` tokens, the `401` sign-in challenge pointing to `/.well-known/oauth-protected-resource/api/mcp`, and plain JSON answers for clients that don't take event streams. Tool schemas are advertised in the JSON Schema subset Gemini accepts (`src/mcp/portable-schema.ts`). `src/mcp/auth.ts` checks Clerk OAuth access tokens with Clerk's Backend API, or looks up an API key's hash. Tools take the driver only from the verified token, never from their arguments.
