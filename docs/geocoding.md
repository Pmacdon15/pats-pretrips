# Address lookup (Google Geocoding)

When a driver opens the new pre-trip form, the browser asks for the phone's
position and the `getAddress` server action (`src/lib/actions/actions.ts`)
turns it into a street address with Google's Geocoding API
(`https://maps.googleapis.com/maps/api/geocode/json`). The address prefills
"Inspection address"; if anything fails, the field stays empty and the driver
types it.

The key lives in the `REVERSE_GEOCODING_API_KEY` environment variable
(listed in `.env.sample`). Set it in Vercel under Project → Settings →
Environment Variables, and in `.env.local` for development. Without it the
form still works, with no prefilled address.

## What the code does

- **Signed-in drivers only**, and at most 60 lookups per driver per hour
  (`GEOCODE` in `src/lib/rate-limit/limits.ts`, see
  [rate-limits.md](rate-limits.md)).
- **Coordinates are checked and rounded on the server** to 4 decimals (about
  10 m), as the browser does, so a caller can't send more precision than the
  form needs.
- **5 second timeout** on the Google request, so a slow Google can't keep a
  Vercel function running.
- **The browser only gets Google's `status` and the first
  `formatted_address`.** Nothing else from Google's answer is passed on, in
  particular not `error_message`.
- **The key is never logged, returned, or put in a thrown error.** Logs hold
  only the HTTP status or Google's status code, with the key and position
  removed from Google's message.
- **The key is in the request URL.** This endpoint only reads it from the
  `key` query parameter. Sent as an `X-Goog-Api-Key` header, Google answers as
  if no key had been sent ("You must use an API key…"), while an invalid key
  in the URL gets "The provided API key is invalid" (checked in November
  2026). The URL only goes from the Vercel function to Google over HTTPS and
  the code never logs it. Google's newer Geocoding API
  (`geocode.googleapis.com/v4…`) does take the key in the `X-Goog-Api-Key`
  header, but it has a different request and response format; moving to it
  is a separate change.
- **No server-side cache.** Google's Maps Service Specific Terms (Geocoding
  API, section 6.3) let an app keep latitude/longitude for up to 30 days, and
  keep addresses only for the end user they were looked up for, and "only
  where the cache is not used as a replacement for making an additional call
  to the Services". A cache of addresses shared between drivers, kept to save
  Google calls, is exactly what that rules out. So every lookup that passes
  the rate limit goes to Google. The rate limit and the quota below are the
  cost controls.

## What only the owner can do, in Google Cloud

Do these in the [Google Cloud console](https://console.cloud.google.com/) for
the project that owns the key.

1. **Limit the key to the Geocoding API.** APIs & Services → Credentials →
   the key → *API restrictions* → *Restrict key* → tick only **Geocoding
   API**. Then a leaked key can't be used for other paid Maps APIs.
2. **Application restrictions.** The key is only used by the server
   (Vercel functions), never in the browser.
   - *IP addresses* is the right kind of restriction for a server key, but
     only if requests leave from fixed IPs. On Vercel's standard plans
     functions use changing outbound IPs, so an IP list would block real
     lookups. If the Vercel plan has static outbound IPs (Vercel's Static
     IPs / Secure Compute), add those IPs and restrict the key to them.
   - Otherwise leave *Application restrictions* at *None* and rely on the
     API restriction, the quota and the budget alert.
   - Don't use *Websites* (HTTP referrer): it's meant for browser keys, the
     server doesn't send a referrer, and anyone holding the key can fake one.
     *Android apps* and *iOS apps* don't apply either.
3. **Cap the daily cost.** APIs & Services → Geocoding API → *Quotas &
   system limits* → lower **Requests per day** to a number above normal use
   (each driver files a few pre-trips a day; start with something like a few
   hundred to a thousand). Once the cap is reached, Google refuses lookups
   until the next day and drivers type the address, so there's no surprise
   bill.
4. **Set a budget alert.** Billing → *Budgets & alerts* → create a budget
   for the project with email alerts (for example at 50%, 90% and 100%).
   An alert doesn't stop spending; the quota in step 3 does.
5. **Rotate the key if it was ever exposed** (pasted in chat or a ticket,
   committed, seen in a log, a proxy or an error report, or shared in a URL):
   Credentials → *Create credentials* → API key, restrict it as in steps 1–2,
   put it in `REVERSE_GEOCODING_API_KEY` in Vercel (Production and Preview),
   redeploy, check an address still prefills, then delete the old key.
