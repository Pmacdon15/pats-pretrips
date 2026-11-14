/*
 * Filling clerk_user_id on rows written before the app recorded it (see
 * docs/clerk-user-id.md). Run by scripts/backfill-clerk-user-ids.ts; it's
 * here, under src/, so the tests and the 100% coverage check include it. The
 * app never imports it.
 *
 * For each driver email with rows whose clerk_user_id is NULL, Clerk is asked
 * which user has that address. A row gets a user ID only when exactly one
 * Clerk user has the address, it is that user's primary, verified address,
 * and the account is older than the rows (a newer account means the address
 * may have been reused by someone else). Anything else is reported and left
 * alone. Rows that already have a user ID are never touched, so it's safe to
 * run again.
 */

/** The driver-owned tables, in the order they're reported. */
export const OWNER_TABLES = [
	'PTTrips',
	'pt_defect_repairs',
	'pt_trip_signatures',
	'pt_driver_signatures',
	'pt_email_settings',
	'pt_email_sends',
] as const

export type OwnerTable = (typeof OWNER_TABLES)[number]

/** An email's rows in one table that have no clerk_user_id yet. */
export type PendingRows = {
	email: string
	rows: number
	/** The oldest of those rows' timestamps (ms since the epoch), if known. */
	earliest: number | null
}

/** What the backfill needs to know about a Clerk user. */
export type ClerkCandidate = {
	id: string
	/** When the account was created (ms since the epoch). */
	createdAt: number
	primaryEmail: string | null
	emails: { address: string; verified: boolean }[]
}

/**
 * Accounts created up to this long after an email's oldest row still count
 * as older than it, for clocks that differ between Clerk and the database.
 */
export const CLOCK_SKEW_MS = 10 * 60 * 1000

export type Decision =
	| { status: 'match'; userId: string }
	/** No Clerk user has the address. */
	| { status: 'no_user' }
	/** More than one Clerk user has it. */
	| { status: 'several_users'; userIds: string[] }
	/** One user has it, but it isn't their primary address. */
	| { status: 'not_primary'; userId: string }
	/** One user has it as their primary address, but it isn't verified. */
	| { status: 'unverified'; userId: string }
	/** The user's account is newer than the rows: the address may be reused. */
	| {
			status: 'account_newer'
			userId: string
			createdAt: number
			earliest: number
	  }

const same = (a: string | null, b: string) =>
	a !== null && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Whose rows an email's are, from the Clerk users the lookup found (which may
 * include users found for other emails). Pure: no network, no database.
 */
export function decideOwner(
	email: string,
	candidates: readonly ClerkCandidate[],
	earliest: number | null,
	{ allowNewerAccounts = false }: { allowNewerAccounts?: boolean } = {},
): Decision {
	const matches = candidates.filter((user) =>
		user.emails.some((e) => same(e.address, email)),
	)
	const ids = [...new Set(matches.map((user) => user.id))]
	if (ids.length === 0) return { status: 'no_user' }
	if (ids.length > 1) return { status: 'several_users', userIds: ids }
	const [user] = matches
	if (!same(user.primaryEmail, email)) {
		return { status: 'not_primary', userId: user.id }
	}
	// The user was matched by this address, so they have it.
	const address = user.emails.find((e) => same(e.address, email)) as {
		verified: boolean
	}
	if (!address.verified) return { status: 'unverified', userId: user.id }
	if (
		!allowNewerAccounts &&
		earliest !== null &&
		user.createdAt > earliest + CLOCK_SKEW_MS
	) {
		return {
			status: 'account_newer',
			userId: user.id,
			createdAt: user.createdAt,
			earliest,
		}
	}
	return { status: 'match', userId: user.id }
}

/* ---- The database ---- */

/** The neon `sql` tagged template, or anything that answers like it. */
export type Sql = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => Promise<Record<string, unknown>[]>

const toPending = (rows: Record<string, unknown>[]): PendingRows[] =>
	rows.map((row) => ({
		email: String(row.email),
		rows: Number(row.rows),
		earliest: row.earliest == null ? null : Number(row.earliest),
	}))

/**
 * Each email's rows in `table` with no clerk_user_id, how many, and the
 * oldest one's time. Throws the database's error (42P01 when the table
 * doesn't exist, 42703 when the migration hasn't added the column).
 */
export async function pendingRows(
	sql: Sql,
	table: OwnerTable,
): Promise<PendingRows[]> {
	switch (table) {
		case 'PTTrips':
			// date is a TIMESTAMP holding UTC (the app writes new Date()).
			return toPending(
				await sql`
                    SELECT driverEmail AS email, COUNT(*)::int AS rows,
                        (EXTRACT(EPOCH FROM MIN(date) AT TIME ZONE 'UTC') * 1000)::float8 AS earliest
                    FROM PTTrips WHERE clerk_user_id IS NULL
                    GROUP BY driverEmail ORDER BY driverEmail
                `,
			)
		case 'pt_defect_repairs':
			return toPending(
				await sql`
                    SELECT driver_email AS email, COUNT(*)::int AS rows,
                        (EXTRACT(EPOCH FROM MIN(created_at)) * 1000)::float8 AS earliest
                    FROM pt_defect_repairs WHERE clerk_user_id IS NULL
                    GROUP BY driver_email ORDER BY driver_email
                `,
			)
		case 'pt_trip_signatures':
			return toPending(
				await sql`
                    SELECT driver_email AS email, COUNT(*)::int AS rows,
                        (EXTRACT(EPOCH FROM MIN(created_at)) * 1000)::float8 AS earliest
                    FROM pt_trip_signatures WHERE clerk_user_id IS NULL
                    GROUP BY driver_email ORDER BY driver_email
                `,
			)
		case 'pt_driver_signatures':
			return toPending(
				await sql`
                    SELECT driver_email AS email, COUNT(*)::int AS rows,
                        (EXTRACT(EPOCH FROM MIN(updated_at)) * 1000)::float8 AS earliest
                    FROM pt_driver_signatures WHERE clerk_user_id IS NULL
                    GROUP BY driver_email ORDER BY driver_email
                `,
			)
		case 'pt_email_settings':
			return toPending(
				await sql`
                    SELECT driver_email AS email, COUNT(*)::int AS rows,
                        (EXTRACT(EPOCH FROM MIN(updated_at)) * 1000)::float8 AS earliest
                    FROM pt_email_settings WHERE clerk_user_id IS NULL
                    GROUP BY driver_email ORDER BY driver_email
                `,
			)
		case 'pt_email_sends':
			return toPending(
				await sql`
                    SELECT driver_email AS email, COUNT(*)::int AS rows,
                        (EXTRACT(EPOCH FROM MIN(created_at)) * 1000)::float8 AS earliest
                    FROM pt_email_sends WHERE clerk_user_id IS NULL
                    GROUP BY driver_email ORDER BY driver_email
                `,
			)
	}
}

/**
 * Sets clerk_user_id on an email's rows in `table` that have none. Rows that
 * already have one are never changed. Answers how many rows it set.
 */
export async function setOwner(
	sql: Sql,
	table: OwnerTable,
	email: string,
	userId: string,
): Promise<number> {
	let rows: Record<string, unknown>[]
	switch (table) {
		case 'PTTrips':
			rows = await sql`
                WITH u AS (
                    UPDATE PTTrips SET clerk_user_id = ${userId}
                    WHERE driverEmail = ${email} AND clerk_user_id IS NULL
                    RETURNING 1
                ) SELECT COUNT(*)::int AS n FROM u
            `
			break
		case 'pt_defect_repairs':
			rows = await sql`
                WITH u AS (
                    UPDATE pt_defect_repairs SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email} AND clerk_user_id IS NULL
                    RETURNING 1
                ) SELECT COUNT(*)::int AS n FROM u
            `
			break
		case 'pt_trip_signatures':
			rows = await sql`
                WITH u AS (
                    UPDATE pt_trip_signatures SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email} AND clerk_user_id IS NULL
                    RETURNING 1
                ) SELECT COUNT(*)::int AS n FROM u
            `
			break
		case 'pt_driver_signatures':
			rows = await sql`
                WITH u AS (
                    UPDATE pt_driver_signatures SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email} AND clerk_user_id IS NULL
                    RETURNING 1
                ) SELECT COUNT(*)::int AS n FROM u
            `
			break
		case 'pt_email_settings':
			rows = await sql`
                WITH u AS (
                    UPDATE pt_email_settings SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email} AND clerk_user_id IS NULL
                    RETURNING 1
                ) SELECT COUNT(*)::int AS n FROM u
            `
			break
		case 'pt_email_sends':
			rows = await sql`
                WITH u AS (
                    UPDATE pt_email_sends SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email} AND clerk_user_id IS NULL
                    RETURNING 1
                ) SELECT COUNT(*)::int AS n FROM u
            `
			break
	}
	return Number(rows[0]?.n ?? 0)
}

/* ---- Clerk ---- */

/** The part of Clerk's Backend API user the backfill reads. */
export type ClerkUser = {
	id: string
	createdAt: number
	primaryEmailAddressId: string | null
	emailAddresses: {
		id: string
		emailAddress: string
		verification: { status: string } | null
	}[]
}

/** The part of `createClerkClient(...)` the backfill uses. */
export type ClerkUsers = {
	getUserList(params: {
		emailAddress: string[]
		limit: number
		offset: number
	}): Promise<{ data: ClerkUser[] }>
}

export function toCandidate(user: ClerkUser): ClerkCandidate {
	const primary = user.emailAddresses.find(
		(e) => e.id === user.primaryEmailAddressId,
	)
	return {
		id: user.id,
		createdAt: user.createdAt,
		primaryEmail: primary?.emailAddress ?? null,
		emails: user.emailAddresses.map((e) => ({
			address: e.emailAddress,
			verified: e.verification?.status === 'verified',
		})),
	}
}

export type LookupOptions = {
	/** Emails per request. */
	batchSize?: number
	/** Users per page. */
	pageSize?: number
	/** Retries after a 429 before giving up. */
	maxRetries?: number
	/** Pause between requests, to stay well under Clerk's rate limit. */
	pauseMs?: number
	sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** A 429 from Clerk, with how long it said to wait (seconds), if it did. */
function rateLimited(error: unknown): { retryAfter?: number } | null {
	if (typeof error !== 'object' || error === null) return null
	const { status, retryAfter } = error as {
		status?: unknown
		retryAfter?: unknown
	}
	if (status !== 429) return null
	return typeof retryAfter === 'number' ? { retryAfter } : {}
}

/**
 * Every Clerk user with any of `emails`, a batch of emails per request and
 * every page of each batch. A 429 waits (as long as Clerk says, else 1, 2,
 * 4... seconds) and retries; any other error is thrown.
 */
export async function findClerkUsers(
	users: ClerkUsers,
	emails: readonly string[],
	{
		batchSize = 50,
		pageSize = 100,
		maxRetries = 5,
		pauseMs = 200,
		sleep = wait,
	}: LookupOptions = {},
): Promise<ClerkCandidate[]> {
	const found = new Map<string, ClerkCandidate>()
	const request = async (
		params: Parameters<ClerkUsers['getUserList']>[0],
	) => {
		for (let attempt = 0; ; attempt++) {
			try {
				return await users.getUserList(params)
			} catch (error) {
				const limited = rateLimited(error)
				if (!limited || attempt >= maxRetries) throw error
				await sleep((limited.retryAfter ?? 2 ** attempt) * 1000)
			}
		}
	}
	for (let i = 0; i < emails.length; i += batchSize) {
		const batch = emails.slice(i, i + batchSize)
		for (let offset = 0; ; offset += pageSize) {
			const page = await request({
				emailAddress: [...batch],
				limit: pageSize,
				offset,
			})
			for (const user of page.data) found.set(user.id, toCandidate(user))
			await sleep(pauseMs)
			if (page.data.length < pageSize) break
		}
	}
	return [...found.values()]
}

/* ---- The run ---- */

export type TableReport = {
	table: OwnerTable
	/** The table doesn't exist in this database. */
	missing?: boolean
	/** Rows with no clerk_user_id before the run. */
	pending: number
	/** Rows given a user ID (or that would be, in a dry run). */
	set: number
	/** Rows left alone because their email was refused. */
	skipped: number
}

export type EmailReport = {
	email: string
	decision: Decision
	/** Rows per table with no clerk_user_id. */
	rows: Partial<Record<OwnerTable, number>>
}

export type BackfillReport = {
	apply: boolean
	tables: TableReport[]
	emails: EmailReport[]
}

const errorCode = (error: unknown) =>
	typeof error === 'object' && error !== null
		? (error as { code?: unknown }).code
		: undefined

export class MigrationMissingError extends Error {
	constructor(table: OwnerTable) {
		super(
			`${table} has no clerk_user_id column. Run src/lib/sql/2026-11-18-clerk-user-id.sql first.`,
		)
		this.name = 'MigrationMissingError'
	}
}

/**
 * Finds every email with rows that have no clerk_user_id, decides each one
 * with Clerk, and (only with `apply`) sets the user ID on the rows of the
 * emails that matched. Without `apply` nothing is written.
 */
export async function runBackfill({
	sql,
	users,
	apply = false,
	allowNewerAccounts = false,
	lookup,
}: {
	sql: Sql
	users: ClerkUsers
	apply?: boolean
	allowNewerAccounts?: boolean
	lookup?: LookupOptions
}): Promise<BackfillReport> {
	const pending = new Map<OwnerTable, PendingRows[]>()
	const tables: TableReport[] = []
	for (const table of OWNER_TABLES) {
		try {
			pending.set(table, await pendingRows(sql, table))
		} catch (error) {
			const code = errorCode(error)
			if (code === '42703') throw new MigrationMissingError(table)
			if (code !== '42P01') throw error
			// A table an earlier, skipped migration would have made: no rows.
			tables.push({
				table,
				missing: true,
				pending: 0,
				set: 0,
				skipped: 0,
			})
		}
	}

	// Each email's rows per table, and its oldest row anywhere.
	const byEmail = new Map<
		string,
		{ rows: EmailReport['rows']; earliest: number | null }
	>()
	for (const [table, rows] of pending) {
		for (const row of rows) {
			const entry = byEmail.get(row.email) ?? { rows: {}, earliest: null }
			entry.rows[table] = row.rows
			if (
				row.earliest !== null &&
				(entry.earliest === null || row.earliest < entry.earliest)
			) {
				entry.earliest = row.earliest
			}
			byEmail.set(row.email, entry)
		}
	}

	const emails = [...byEmail.keys()].sort()
	const candidates =
		emails.length > 0 ? await findClerkUsers(users, emails, lookup) : []
	const decisions: EmailReport[] = emails.map((email) => {
		const entry = byEmail.get(email) as {
			rows: EmailReport['rows']
			earliest: number | null
		}
		return {
			email,
			rows: entry.rows,
			decision: decideOwner(email, candidates, entry.earliest, {
				allowNewerAccounts,
			}),
		}
	})

	for (const [table, rows] of pending) {
		const report: TableReport = {
			table,
			pending: rows.reduce((sum, row) => sum + row.rows, 0),
			set: 0,
			skipped: 0,
		}
		for (const { email, rows: counts, decision } of decisions) {
			const count = counts[table]
			if (count === undefined) continue
			if (decision.status !== 'match') {
				report.skipped += count
			} else if (apply) {
				report.set += await setOwner(sql, table, email, decision.userId)
			} else {
				report.set += count
			}
		}
		tables.push(report)
	}
	tables.sort(
		(a, b) => OWNER_TABLES.indexOf(a.table) - OWNER_TABLES.indexOf(b.table),
	)
	return { apply, tables, emails: decisions }
}

const iso = (ms: number) => new Date(ms).toISOString()

/** Why an email was refused, in a sentence. */
export function explain(decision: Decision): string {
	switch (decision.status) {
		case 'match':
			return `Clerk user ${decision.userId}`
		case 'no_user':
			return 'no Clerk user has this address (deleted account, or the address changed)'
		case 'several_users':
			return `more than one Clerk user has this address (${decision.userIds.join(', ')})`
		case 'not_primary':
			return `Clerk user ${decision.userId} has this address, but not as their primary address`
		case 'unverified':
			return `Clerk user ${decision.userId} has not verified this address`
		case 'account_newer':
			return `Clerk user ${decision.userId} was created ${iso(decision.createdAt)}, after this address's oldest row (${iso(decision.earliest)}): the address may have been reused by someone else`
	}
}

/** The report as lines of text, for the script to print. */
export function formatReport(report: BackfillReport): string[] {
	const lines = [
		report.apply
			? 'APPLIED: clerk_user_id was set on the rows below.'
			: 'DRY RUN: nothing was written. Run again with --apply to write.',
		'',
		'Rows without clerk_user_id, per table:',
	]
	for (const t of report.tables) {
		lines.push(
			t.missing
				? `  ${t.table}: table does not exist, skipped`
				: `  ${t.table}: ${t.pending} pending, ${t.set} ${report.apply ? 'set' : 'would be set'}, ${t.skipped} refused`,
		)
	}
	const matched = report.emails.filter((e) => e.decision.status === 'match')
	const refused = report.emails.filter((e) => e.decision.status !== 'match')
	const rows = (e: EmailReport) =>
		Object.entries(e.rows)
			.map(([table, n]) => `${table} ${n}`)
			.join(', ')
	lines.push(
		'',
		`${matched.length} email(s) matched a Clerk user:`,
		...matched.map(
			(e) => `  ${e.email} -> ${explain(e.decision)} (${rows(e)})`,
		),
		'',
		`${refused.length} email(s) refused, their rows left without a user ID:`,
		...refused.map(
			(e) => `  ${e.email}: ${explain(e.decision)} (${rows(e)})`,
		),
	)
	return lines
}
