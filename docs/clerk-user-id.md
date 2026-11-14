# Clerk user IDs on driver data

Every table keys a driver's rows by their primary email address (`driverEmail`
on `PTTrips`, `driver_email` elsewhere). That breaks in two ways:

- If an address is released and later verified on a different Clerk account,
  that account sees the old account's trips, signatures and invoices.
- A driver who changes their primary email no longer sees their records.

The fix is to key rows by the Clerk user ID (`user_...`), which never changes.
It's done in two stages.

## Stage one (this change): record the user ID

- `src/lib/sql/2026-11-18-clerk-user-id.sql` adds a nullable `clerk_user_id`
  column, and indexes for stage two, to `PTTrips`, `pt_defect_repairs`,
  `pt_trip_signatures`, `pt_driver_signatures`, `pt_email_settings` and
  `pt_email_sends`. (`pt_api_keys` is being removed; `pt_rate_limits` isn't a
  driver's data.) It skips any table that doesn't exist and is safe to run
  again.
- After every write (a new trip, on-route defects, an MCP trip update,
  signing a trip, saving the driver's signature, email settings, a repair, a
  logged email send), the app stamps the row with the driver's user ID using a
  separate small `UPDATE` (`src/lib/db/owner-stamps.ts`). The write statements
  themselves are unchanged, so **saving works exactly as before even when the
  code is deployed before the migration runs**: the stamp then fails, the error
  is swallowed, and the server logs once per instance `Owner stamp: the
  clerk_user_id column is missing ... Run
  src/lib/sql/2026-11-18-clerk-user-id.sql.`
- A stamp only fills a `NULL` `clerk_user_id`. If the row already holds a
  different user ID, it is left alone and the server logs `Owner stamp: ...
  already belongs to a different Clerk user than user_...`. That is the
  reused-address case: look into it rather than letting the app overwrite it.
- Stamps run after the response (`after()` from `next/server`) in server
  actions and in the MCP route handler, so they add no time to the driver's
  action; Vercel keeps the function alive until they finish. Where `after()`
  isn't available, the stamp is awaited. Each costs one indexed `UPDATE` per
  row written.
- **Reads still filter by email.** Nothing a driver sees changes.

`scripts/backfill-clerk-user-ids.ts` fills the column on rows written before
the deploy.

## What to do, in order

1. **Run the migration** against production:
   `src/lib/sql/2026-11-18-clerk-user-id.sql`. Check every table got the
   column:

   ```sql
   SELECT table_name FROM information_schema.columns
   WHERE column_name = 'clerk_user_id' ORDER BY table_name;
   ```

   Six tables. If one is missing, run that table's own migration, then this one
   again.
2. **Deploy.** New writes are stamped from now on. (Deploying first is safe
   too; rows written before the migration just stay `NULL` until the backfill.)
3. **Dry run the backfill**, with production's `DATABASE_URL` and
   `CLERK_SECRET_KEY`:

   ```sh
   bun scripts/backfill-clerk-user-ids.ts
   ```

   It writes nothing. It prints, per table, how many rows have no user ID, how
   many would be set and how many are refused, then every email with the
   Clerk user it matched or why it was refused.
4. **Read the report.** An email is only matched when exactly one Clerk user
   has the address, it is that user's primary, verified address, and the
   account was created before the email's oldest row (within 10 minutes).
   Refused emails, and what they usually mean:
   - _no Clerk user has this address_: the account was deleted, or the driver
     changed their email. Find the driver's current account in the Clerk
     dashboard if the data matters.
   - _more than one Clerk user_ or _not their primary address_: the address
     moved between accounts. Decide by hand whose rows they are.
   - _not verified_: wait for the driver to verify, or decide by hand.
   - _created after this address's oldest row_: the address may have been
     reused by a new account, which is exactly the problem this fixes. Check
     in the Clerk dashboard. Only if every such email is really the same
     driver (e.g. after moving Clerk instances), run step 5 with
     `--allow-newer-accounts`.

   To give refused rows a user ID by hand (only where the column is still
   `NULL`):

   ```sql
   UPDATE PTTrips SET clerk_user_id = 'user_...'
   WHERE driverEmail = 'driver@example.com' AND clerk_user_id IS NULL;
   ```

   and the same with `driver_email` on the other five tables.
5. **Apply:**

   ```sh
   bun scripts/backfill-clerk-user-ids.ts --apply
   ```

   Only rows whose `clerk_user_id` is `NULL` are changed, so it's safe to run
   again, e.g. once more a day later to catch rows written by a deploy that was
   still rolling out. A second dry run should show only the refused emails.
6. **Watch the logs** for `Owner stamp:` lines for a while: a missing-column
   line means the migration didn't reach that database; an "already belongs to
   a different Clerk user" line is a row to look into.

## Stage two (later, a separate change): read by user ID

Not done yet. It will need:

- Every row to have a user ID: re-run the backfill dry run until nothing is
  pending, and settle each refused email by hand.
- Every read and every write's `WHERE` to filter by `clerk_user_id` (from
  `getDriver().userId` in the web app and `caller.userId` in the MCP server)
  instead of the email, including the cache tags in `src/lib/cache`, which are
  per email today.
- The writes to insert `clerk_user_id` directly, after which
  `src/lib/db/owner-stamps.ts` and its calls are removed.
- `clerk_user_id SET NOT NULL` on every table, and new keys: the primary keys
  of `pt_driver_signatures` and `pt_email_settings` are the email today, so a
  driver who changed address can have two rows with the same user ID; pick
  the newest, delete the other, then make `clerk_user_id` the key (the
  stage-one indexes are deliberately not `UNIQUE` for this reason).
- The rate-limit buckets and the email send limits to count by user ID.
- MCP tokens without a user ID (none after SEC-10 removes API keys) to be
  refused.
- Optionally, the old email indexes dropped once nothing reads by email.
