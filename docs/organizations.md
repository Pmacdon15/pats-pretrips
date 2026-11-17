# Organizations and personal spaces

Pat's PreTrips uses [Clerk Organizations](https://clerk.com/docs/organizations/overview).
Every signed-in driver works in one **space** at a time, picked with the
switcher in the header:

| | Personal space | An organization's space |
| --- | --- | --- |
| When | No active organization (Clerk's "Personal account") | The organization picked in the switcher |
| Saved vehicles and carriers | The driver's own (`pt_vehicles`, `pt_carriers`) | The organization's fleet (`pt_org_vehicles`) and sites (`pt_org_carriers`), shared by every member |
| Carrier on a new pre-trip | Typed, or picked from saved carriers | Always the organization's name |
| Email settings (who new pre-trips go to, auto-send) | The driver's own (`pt_email_settings`) | The organization's (`pt_org_email_settings`), used for every member's trips |
| Who can change those | The driver: a solo user is the admin of their own space | Only the organization's admins (Clerk role `org:admin`) |
| Plan that unlocks emailing pre-trips | The driver's own plan (`u:email_pretrips`) | The organization's plan (`o:email_pretrips`) |
| Trips, repairs, signatures, send limits | Always the driver's own, in every space | Always the driver's own, in every space |

## The organization is the carrier

In an organization's space the organization itself is the carrier on every
pre-trip. The new pre-trip form fills the **Carrier** field with the
organization's name (from Clerk) and locks it; the server sets it again
when the trip is saved (`addTripDAL` in `src/lib/DAL/inserts.ts`, via
`getOrgName()` in `src/lib/auth.ts`), so a member can't send another name.
If Clerk can't be reached the typed carrier is kept, so a trip can always be
saved.

What an organization saves on the Carriers page are therefore its **sites**:
the shops, yards and depots its drivers start from ("North Shop", "South
Base"), each with its address. They live in `pt_org_carriers` (the `name`
column is the site's name), so no new migration is needed. Picking a site on
a new pre-trip fills in the carrier address; the carrier stays the
organization. Admins add, change and delete sites; members pick them.

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
which carries the user but no active organization, so the tools name the
space themselves (`src/mcp/spaces.ts`):

- `list_organizations` reads the driver's memberships from Clerk
  (`users.getOrganizationMembershipList`) with each one's `organization_id`,
  role and `is_admin`.
- `list_vehicles`, `add_vehicle`, `update_vehicle`, `delete_vehicle`,
  `list_trailers`, `add_trailer`, `update_trailer` and `delete_trailer`
  take an optional `organization_id`. Without it they use the driver's
  personal `pt_vehicles` / `pt_trailers`, as before. With it they use the
  organization's `pt_org_vehicles` / `pt_org_trailers`.
- Membership and role are read from Clerk on every call, for the verified
  caller, never taken from the arguments: an id the driver isn't a member of
  answers `not_a_member`; any member can list; only an `org:admin` can add,
  change or delete (`not_org_admin` otherwise), the same rule as the web
  app's DALs. An admin of several organizations manages each one's fleet by
  passing its id.
- `get_trip_defaults` and `start_trip` take `organization_id` too: the
  suggested vehicles and trailers, and `start_trip`'s `vehicle_id`, are then
  the organization's, and the organization's name is the trip's carrier.
  The trip stays the driver's own.
- Writes clear the organization's cached vehicle and trailer lists, so the
  web app shows them straight away, and are audited with `details.org_id`.

## Audit trail

Changes made in an organization's space are recorded in `pt_audit_events`
under the admin who made them, with `details.org_id` set to the
organization.
