# Organizations and personal spaces

Pat's PreTrips uses [Clerk Organizations](https://clerk.com/docs/organizations/overview).
Every signed-in driver works in one **space** at a time, picked with the
switcher in the header:

| | Personal space | An organization's space |
| --- | --- | --- |
| When | No active organization (Clerk's "Personal account") | The organization picked in the switcher |
| Saved vehicles and carriers | The driver's own (`pt_vehicles`, `pt_carriers`) | The organization's fleet (`pt_org_vehicles`, `pt_org_carriers`), shared by every member |
| Email settings (who new pre-trips go to, auto-send) | The driver's own (`pt_email_settings`) | The organization's (`pt_org_email_settings`), used for every member's trips |
| Who can change those | The driver: a solo user is the admin of their own space | Only the organization's admins (Clerk role `org:admin`) |
| Plan that unlocks emailing pre-trips | The driver's own plan (`u:email_pretrips`) | The organization's plan (`o:email_pretrips`) |
| Trips, repairs, signatures, send limits | Always the driver's own, in every space | Always the driver's own, in every space |

For a solo user nothing changes: with no organization, the app reads and
writes exactly the tables and rows it did before.

## Admin checks

Every "may this driver manage this space?" check goes through one place:

- **Server:** `getSpace()` / `isSpaceAdmin()` in `src/lib/auth.ts`. In the
  personal space the driver is always the admin; in an organization it's
  `has({ role: 'org:admin' })`. The DALs for vehicles, carriers and email
  settings refuse writes from a member who isn't an admin
  (`Only an admin of your organization can change its …`), before the rate
  limit or the database is touched.
- **Browser:** `useSpace()` in `src/lib/hooks/space.ts` reads the same thing
  from Clerk's client session, only to hide the add/edit/delete controls and
  show the read-only notes. The server check is what's enforced.

Emailing pre-trips is gated with Clerk's `has()` on the active space's
plan: `canEmailPretrips()` asks for `u:email_pretrips` in the personal space
and `o:email_pretrips` in an organization's, so one space's plan never
unlocks email in the other. Any member of an organization on a plan with the
feature can email a trip from its page; only its admins change the
organization's recipients and auto-send.

## The SQL scope check

`tests/db/driver-scope.test.ts` reads every SQL statement and fails if one
doesn't limit an owned table to its owner. The organization tables are listed
there with `owner: 'clerk_org_id'` and `identity: /orgId$/`, so every
statement on them must filter by `clerk_org_id = ${orgId}` (the active
organization's ID from Clerk, never a value from the request). Their
`driver_email` / `clerk_user_id` columns only record which admin saved the row.

## Setup, in order

1. **Run the migration** `src/lib/sql/2026-11-22-organizations.sql` (safe to
   run again). Until it runs, an organization's space shows no vehicles or
   carriers and empty email settings, and saving them fails with a message;
   the personal space is unaffected. To check:

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_name LIKE 'pt_org_%' ORDER BY table_name;
   ```

2. **In the Clerk dashboard:**
   - Turn on **Organizations** (Configure → Organizations → Settings).
   - Keep **personal accounts allowed** (Membership options: "Membership
     optional"). If membership is required, Clerk makes every user create or
     join an organization and the personal space disappears.
   - The default roles are what the app expects: `org:admin` manages the
     space, `org:member` uses it.
   - For email in organizations: under **Billing → Plans**, add an
     **organization plan** with the `email_pretrips` feature. The Email page
     shows the organization's plans (`<PricingTable for="organization" />`)
     while an organization is active.

3. **Deploy.** Deploying before step 1 is safe too.

## AI apps (MCP)

The MCP server (`/api/mcp`) authenticates with a Clerk OAuth access token,
which carries the user but no active organization. Its vehicle tools
therefore always use the driver's personal vehicles, as before.

## Audit trail

Changes made in an organization's space are recorded in `pt_audit_events`
under the admin who made them, with `details.org_id` set to the
organization.
