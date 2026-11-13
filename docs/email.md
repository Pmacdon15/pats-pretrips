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

## Database

Run `src/lib/sql/2026-11-13-email.sql` once (safe to re-run).
