# Emailing pre-trips (Amazon SES)

Drivers on a paid plan can email a pre-trip as a PDF:

- **When it's completed**: on `/email`, add up to 5 addresses and tick
  *Email each pre-trip when I complete it*. Every new pre-trip saved in the
  web app is then sent to them, right after it's saved.
- **Any time**: every trip's page has an *Email this pre-trip* box.

Each email has the pre-trip in the body (HTML and plain text) and the full
report attached as a PDF. Both have links back to the trip in the app to
edit it or add an on-route defect (`/pretrip/<id>#add-defect`). Replies go to
the driver's own email.

## Paywall: Clerk Billing

The feature is locked behind the Clerk Billing feature **`email_pretrips`**
(`EMAIL_FEATURE` in `src/lib/email/config.ts`).

1. Clerk Dashboard → Billing → enable billing and connect Stripe.
2. Create a plan for users (e.g. "Pro") and add a feature with the slug
   `email_pretrips`.
3. Drivers without it see Clerk's `<PricingTable />` on `/email` and a
   "See plans" button on each trip.

## AWS setup

1. SES console (pick a region, e.g. `ca-central-1`): verify the domain
   `patspretrips.ca` (adds DKIM DNS records) or at least the sender address.
2. Request production access, or SES only sends to verified addresses
   (sandbox).
3. IAM: create a user with only this policy and make an access key:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" }
     ]
   }
   ```

## Environment variables (Vercel)

| Name | Example |
| --- | --- |
| `SES_FROM_EMAIL` | `Pat's PreTrips <trips@patspretrips.ca>` |
| `AWS_REGION` | `ca-central-1` |
| `AWS_ACCESS_KEY_ID` | from the IAM user |
| `AWS_SECRET_ACCESS_KEY` | from the IAM user |
| `APP_URL` | optional, defaults to `https://patspretrips.ca` |

Without `SES_FROM_EMAIL` nothing is sent and the trip page says email isn't
set up yet.

## Send limits

So a paid account (or a stolen one, or a script calling the server action in
a loop) can't use the app's SES sender to spam people, each driver can email
to at most:

| Limit | Value | Constant (`src/lib/email/config.ts`) |
| --- | --- | --- |
| Addresses in one email | 5 | `MAX_RECIPIENTS` |
| Addresses in any rolling 24 hours | 60 | `DAILY_SEND_LIMIT` |
| Addresses in any 10 minutes | 25 | `BURST_SEND_LIMIT` |

Each address counts: one pre-trip to 3 people is 3. Manual and automatic
sends share the limits. A busy driver (about 3 pre-trips a day, auto-sent to
5 people) uses 15 a day, so they have room to re-send several old trips too.

- **Manual sends** over a limit aren't sent; the driver is told how long until
  they can send again (e.g. "You can send this one in about 2 hours").
- **Auto-sends** over a limit are skipped and logged on the server
  (`Not auto-emailing trip …`); the pre-trip is still saved.

Every email is logged in `pt_email_sends`: the driver, the trip, how many
addresses (not the addresses themselves), manual or auto, when, and SES's
message id (to trace a bounce or complaint back to a driver). A row is
reserved before the email goes to SES and the count and the reservation run
under a per-driver lock, so parallel requests can't get past the limits. If
SES refuses the email the row is deleted. A row left `reserved` means the
server stopped mid-send; it still counts.

**Before the migration is run**, emails still send, without limits, and the
server logs once per instance that `pt_email_sends` is missing. The same goes
if the limit check hits any other database error (logged each time): a
database problem never blocks a paying driver's email or a trip save.

Old rows no longer count after a day; prune them when they're no longer
useful, e.g. `DELETE FROM pt_email_sends WHERE created_at < NOW() - INTERVAL '90 days';`.

### Worth turning on in AWS

- An SES sending quota / max send rate that fits the app's real volume, so a
  bug or abuse can't send far more than the drivers ever would.
- CloudWatch alarms on the SES `Reputation.BounceRate` and
  `Reputation.ComplaintRate` metrics, and an SNS topic for bounce and
  complaint notifications (the logged message id finds the driver).

## Database

Run these once each (safe to re-run):

1. `src/lib/sql/2026-11-13-email.sql`: the email settings.
2. `src/lib/sql/2026-11-16-email-sends.sql`: the send log behind the limits.
