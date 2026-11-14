/*
 * Fills clerk_user_id on driver rows written before the app recorded it.
 * See docs/clerk-user-id.md for when to run it.
 *
 *   bun scripts/backfill-clerk-user-ids.ts           # dry run: prints, writes nothing
 *   bun scripts/backfill-clerk-user-ids.ts --apply   # writes
 *
 * Needs DATABASE_URL and CLERK_SECRET_KEY (production's, to backfill
 * production). Optional: --allow-newer-accounts also matches an email whose
 * Clerk account is newer than its oldest rows; only use it after checking
 * those emails by hand, since that is what a reused address looks like.
 *
 * Only rows whose clerk_user_id is NULL are ever changed, so it's safe to run
 * again. The decisions are made in src/lib/backfill/clerk-user-ids.ts.
 */
import { createClerkClient } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'
import {
	formatReport,
	runBackfill,
	type Sql,
} from '../src/lib/backfill/clerk-user-ids'

const KNOWN_FLAGS = new Set(['--apply', '--allow-newer-accounts'])
const args = process.argv.slice(2)
const unknown = args.filter((arg) => !KNOWN_FLAGS.has(arg))
if (unknown.length > 0) {
	console.error(`Unknown argument(s): ${unknown.join(' ')}`)
	console.error(
		'Usage: bun scripts/backfill-clerk-user-ids.ts [--apply] [--allow-newer-accounts]',
	)
	process.exit(2)
}

const { DATABASE_URL, CLERK_SECRET_KEY } = process.env
if (!DATABASE_URL || !CLERK_SECRET_KEY) {
	console.error('Set DATABASE_URL and CLERK_SECRET_KEY.')
	process.exit(2)
}

const apply = args.includes('--apply')
const report = await runBackfill({
	sql: neon(DATABASE_URL) as unknown as Sql,
	users: createClerkClient({ secretKey: CLERK_SECRET_KEY }).users,
	apply,
	allowNewerAccounts: args.includes('--allow-newer-accounts'),
})
for (const line of formatReport(report)) console.log(line)
