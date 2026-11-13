# Using Pat's PreTrips from an AI assistant

PreTrips has an MCP server at **`https://patspretrips.ca/api/mcp`**. Connect it to Claude, Muse, Gemini or any other app that supports MCP connectors. Then send the assistant a photo of the odometer and the truck's licence plate, tell it the make and model, and it starts your pre-trip for you. It can also update a trip from the last 24 hours, like a new odometer reading or a defect you found on route.

The rules below are sent to every assistant automatically when it connects (the server's MCP `instructions`, in `src/mcp/instructions.ts`), so you don't need to paste anything.

## Connecting

1. In your AI app, add a custom connector with the URL `https://patspretrips.ca/api/mcp`.
2. When it asks, sign in with your PreTrips account (Clerk, the same sign-in as the website). The assistant only ever sees your own trips.
3. Send it your photos, e.g. *"Start my pre-trip"* with a picture of the dash and one of the plate.

If your app can't sign in with OAuth, open **Connect AI** in PreTrips (`/connect`), choose **Create API key**, and give the app the URL plus the key (as `Authorization: Bearer ppt_…`). The key is shown once; you can revoke it there at any time.

### Setting up sign-in (once, in Clerk)

PreTrips signs in with Clerk, like Budget and Clock Out. Clerk registers AI apps by itself, as long as it's switched on:

- **Claude, ChatGPT and other apps that register themselves**: in the Clerk dashboard for PreTrips, go to **Configure → OAuth applications** and turn on **Dynamic client registration**. That's all: the AI app finds Clerk through `/.well-known/oauth-protected-resource/api/mcp`, registers, and sends the driver to sign in.
- **Apps that ask for a Client ID (Muse, sometimes Gemini)**: in **OAuth applications**, add an application for that app, add its callback URL (Gemini's looks like `https://oauth-redirect.googleusercontent.com/r/...`), turn on PKCE (public client) or keep the secret for apps that ask for one, and give the app the Client ID with `https://patspretrips.ca/api/mcp` as the server URL.
- **Optional:** set `MCP_TOKEN_AUDIENCE` to only accept tokens issued for that audience.

The issuer AI apps are told about is the Clerk Frontend API from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (e.g. `https://clerk.patspretrips.ca`); set `MCP_OAUTH_ISSUER` to override it. Access tokens are checked with Clerk's Backend API (`CLERK_SECRET_KEY`), and the driver's email is their Clerk primary email. Ask for the scopes `profile email offline_access` (not `openid`: Clerk rejects a dynamic client registration that asks for it, as Muse found); `offline_access` gets the refresh token that keeps the connector signed in (Gemini needs it).

### Production instance

Clerk's production instance runs on `patspretrips.ca`. The DNS is on Vercel, which already has:

| Name | Type | Value |
| --- | --- | --- |
| `clerk` | CNAME | `frontend-api.clerk.services` |
| `accounts` | CNAME | `accounts.clerk.services` |

Clerk also lists three email records (`clkmail`, `clk._domainkey`, `clk2._domainkey`) whose values are specific to the instance. Add them in Vercel from the Clerk dashboard's **Domains** page, then deploy the certificates there. Use the production keys (`pk_live_…`, `sk_live_…`) in Vercel's Production environment; the Connect AI issuer is then `https://clerk.patspretrips.ca`.

### Database

Run `src/lib/sql/2026-11-12-ai-connector.sql` once against the database. It adds the `pt_api_keys` table and an index; it's safe to run again. (Don't run `makeDb.sql`: it drops the trips table.)

## The rules

1. **Read the photos.** The assistant reads the odometer (whole kilometres, without the tenths digit), the truck plate and any trailer plates, and the make and model from a badge or from you. It never guesses a digit it can't read.
2. **Look up the defaults.** `get_trip_defaults` with the plate gives the carrier, carrier address and inspection address from your last trip and, if you've driven that truck before, its make, model, trailers and last odometer.
3. **Confirm the whole trip with you.** For example: *"Start a pre-trip: Freightliner Cascadia, plate ABC 1234, 482,317 km, carrier Acme Freight (12 Depot Rd), inspected at 455 Yard Ave, no defects. OK?"* It always asks where you're inspecting and whether you found defects. Nothing is saved until you say OK.
4. **`start_trip` saves it.** Defects use the app's names (`list_defect_categories`). Remarks are required: your words, or "No defects found".
5. **Odometer going backwards?** If the reading is lower than the truck's last one, the assistant gets a warning and checks the photo with you.
6. **Updates for 24 hours.** `update_trip` changes only the fields you pass. Defects and remarks are only added to, never removed. Trips older than 24 hours can't be changed, same as on the website.

## Tools

| Tool | What it does | Changes data? |
| --- | --- | --- |
| `list_defect_categories` | The defect names PreTrips uses | No |
| `get_trip_defaults` | Suggestions for a new trip from your last trip and, with `truck_plate`, that truck's make, model, trailers and last odometer | No |
| `start_trip` | Saves a new pre-trip: `odometer`, `make`, `model`, `carrier`, `carrier_address`, `inspection_address`, `remarks`, optional `truck_plate`, `trailer_plate_a`, `trailer_plate_b`, `defects` | Yes |
| `update_trip` | Changes a trip from the last 24 hours: `trip_id` plus only what changes; `add_defects` and `add_remarks` add on-route defects | Yes |
| `list_trips` | Your trips, 10 per page: `when` is `current` (last 24 hours) or `past` | No |
| `get_trip` | One trip by `trip_id` | No |

In AI apps that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps) (Claude, ChatGPT and others), `list_trips` and `get_trip` also show their result as a trips card in the chat: each trip's truck, plates, odometer, defects and remarks, with a link to open it in PreTrips. The card is the `ui://pats-pretrips/trips-card.html` resource (`src/mcp/trips-card.ts`); apps without MCP Apps just read the text answer.

## How it's built

The same way as Budget and Clock Out: `src/app/api/mcp/route.ts` runs [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) (Streamable HTTP, stateless) behind `src/mcp/http.ts`, which handles CORS, case-insensitive `Bearer` tokens, the `401` sign-in challenge pointing to `/.well-known/oauth-protected-resource/api/mcp`, and plain JSON answers for clients that don't take event streams. Tool schemas are advertised in the JSON Schema subset Gemini accepts (`src/mcp/portable-schema.ts`). `src/mcp/auth.ts` checks Clerk OAuth access tokens with Clerk's Backend API, or looks up an API key's hash. Tools take the driver only from the verified token, never from their arguments.
