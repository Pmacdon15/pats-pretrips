# Audit trail

Every change a driver makes, in the web app or through an AI app over the
MCP connector (`/api/mcp`), adds one row to `pt_audit_events`: who (the
driver's email and Clerk user ID), what (`action`), from where (`source`),
which trip or repair, when, and a few details of what changed. The app only
ever inserts rows; nothing in the app reads, changes or deletes them, and
there is no page for them yet. They're for the owner to look into what
happened to a record, with SQL.

## What is recorded

| `action` | When | `source` | `details` |
| --- | --- | --- | --- |
| `trip.created` | A new pre-trip (web form or `start_trip`) | `web`, or the AI app's name | `signed`, `defects` (names), `remarks_length`; from AI also `signing` (`allowed`, `ai_signing_off`, `no_saved_signature`, `not_requested`) |
| `trip.signed` | A trip signed: on creation, from the trip's page, or `update_trip` with `sign: true` | as above | `signature`: `saved` or `drawn` (AI apps: always `saved`) |
| `trip.updated` | `update_trip` changed a core detail | AI app's name | `changed` (field names), `from` and `to` (their old and new values), plus `defects_added` / `remarks_added_length` if those were added too |
| `trip.defects_added` | Defects added (on-route form, or `update_trip`), no core change | `web` or AI app | `defects_added` (names), `remarks_added_length` |
| `trip.remarks_added` | Only remarks added | `web` or AI app | `remarks_added_length` |
| `repair.recorded` | A defect marked repaired | `web`, or `AI: <name>` / `AI assistant` | `defect`, `repaired_on`, `invoice_number`, `invoice_attached`, `signature_attached` |
| `repair.deleted` | A repair undone. The repair, its invoice and the mechanic's signature are deleted for good; this is the record that they existed | as above | the same as `repair.recorded`, plus `recorded_by` (who had recorded it) |
| `signature.saved` | The driver's saved signature saved or replaced | `web` | `while_signing: true` when saved from a signing form |
| `signature.deleted` | The saved signature deleted (only when there was one) | `web` | none |
| `signature.ai_signing_changed` | "Allow AI apps to sign for me" turned on or off | `web` | `allow_ai_signing` |
| `email.settings_saved` | Email settings saved | `web` | `recipient_count`, `auto_send`, `time_zone` |
| `email.sent` | A pre-trip emailed, manually or automatically on save | `web` | `kind` (`manual` / `auto`), `recipient_count`, `send_id` (the `pt_email_sends` row, or null when the send log couldn't be used) |

`source` is spelled the way the changed table already records it, so the two
can be matched: for trips and trip signatures it is the AI app's name, as in
`pt_trip_signatures.source` (`ai` when the app gave none); for repairs it is
`AI: <name>` (or `AI assistant`), as in `pt_defect_repairs.source`.

Only changes that were saved are recorded. A refused change (a signed trip's
locked details, a defect list that's full, a trip older than 24 hours,
another driver's trip, over a rate limit) or a failed one records nothing.
An `update_trip` that resends every field with its current value saves
nothing new and records nothing.

`email.sent` is recorded although `pt_email_sends` also logs sends: that log
is for the send limits, keeps no row when it can't be used (before its
migration, or on a database error), and its migration suggests pruning it
after 90 days. The audit event links to it through `send_id`.

## What is not recorded

- Signature images, invoice files or any other file.
- Recipients' email addresses (only how many), tokens, coordinates.
- Free text: remarks and repair notes are on the trip and repair rows; the
  event says remarks were added and how long they were. Mechanic and shop
  names stay on the repair row.
- Reads (viewing trips, downloading files), sign-ins, rate-limit counters,
  and the Clerk user ID stamps themselves.
- A trip's old values for fields that can't change: defects and remarks are
  only ever appended to, so the trip row keeps everything that was added.

The old and new values in `trip.updated` are read from the trip row by the
same `UPDATE` that overwrote it (the locked row in its `target` step), not
from the trip the MCP tool read first, which is cached and could be out of
date. So they are exactly what was overwritten, with no extra query.

## Best-effort, not a ledger

Events are written by a separate small `INSERT` after the change itself has
succeeded (`src/lib/db/audit-events.ts`), never inside the change's own
statement. In server actions and the MCP route it runs after the response
(`after()` from `next/server`; Vercel keeps the function alive until it
finishes), so it adds no time to what the driver does; elsewhere it's
awaited. It never throws: a failure is logged and the driver's change
stands.

The trade-off: if the function dies between the change and the insert
(a crash, a timeout, a deploy at that moment), or the insert fails, that
event is lost. This is a trail of what happened, good for "what changed on
this trip, when and from where", not a tamper-proof ledger. The database
owner can still change rows unless the hardening below is applied.

Cost per change: one extra indexed `INSERT` (two when a trip is created
and signed together, or changed and signed together), after the response.

## Setting it up

Run `src/lib/sql/2026-11-19-audit-events.sql` once against the database. It's
safe to run again. It creates `pt_audit_events` with an index for a
driver's history (`driver_email, created_at`) and one for a trip's history
(`trip_id, created_at`).

Deploying first is safe: until the file is run, each insert fails with
"undefined table" (`42P01`), which is swallowed, and the server logs once per
instance: `Audit: the pt_audit_events table is missing, so changes are not
being recorded in the audit trail. Run
src/lib/sql/2026-11-19-audit-events.sql.` Changes made before that aren't in
the trail.

### Optional hardening

The app never updates or deletes events, so it works with either of these
(the SQL file has them in full):

1. If the app connects as its own role, not the table's owner:
   `REVOKE UPDATE, DELETE, TRUNCATE ON pt_audit_events FROM <app role>;`
2. Or a trigger that raises on `UPDATE`, `DELETE` and `TRUNCATE` for every
   role. Disable it while pruning.

### Retention

Events are small (a few hundred bytes). Keep them at least as long as the
trips they describe; trips aren't pruned today, so neither are events. If
they ever are, prune both together.

## Example queries

A trip's history, oldest first (replace the trip id and email):

```sql
SELECT created_at, action, source, details
FROM pt_audit_events
WHERE trip_id = 123 AND driver_email = 'driver@example.com'
ORDER BY created_at;
```

A driver's last 50 changes:

```sql
SELECT created_at, action, source, trip_id, repair_id, details
FROM pt_audit_events
WHERE driver_email = 'driver@example.com'
ORDER BY created_at DESC
LIMIT 50;
```

Every edit to a trip's core details, with what changed:

```sql
SELECT created_at, source, details->'changed' AS fields,
    details->'from' AS old_values, details->'to' AS new_values
FROM pt_audit_events
WHERE trip_id = 123 AND action = 'trip.updated'
ORDER BY created_at;
```

Repairs that were deleted, and what they had:

```sql
SELECT created_at, source, trip_id, repair_id, details
FROM pt_audit_events
WHERE driver_email = 'driver@example.com' AND action = 'repair.deleted'
ORDER BY created_at DESC;
```
