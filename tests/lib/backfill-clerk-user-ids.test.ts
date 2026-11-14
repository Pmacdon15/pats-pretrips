import { describe, expect, it, vi } from 'vitest'
import {
	CLOCK_SKEW_MS,
	type ClerkCandidate,
	type ClerkUser,
	type ClerkUsers,
	decideOwner,
	explain,
	findClerkUsers,
	formatReport,
	MigrationMissingError,
	OWNER_TABLES,
	type OwnerTable,
	pendingRows,
	runBackfill,
	type Sql,
	setOwner,
	toCandidate,
} from '@/lib/backfill/clerk-user-ids'
import { createSqlMock } from '../db/sql-mock'

const DAY = 24 * 60 * 60 * 1000
const JAN = Date.UTC(2026, 0, 1)

const candidate = (over: Partial<ClerkCandidate> = {}): ClerkCandidate => ({
	id: 'user_1',
	createdAt: JAN,
	primaryEmail: 'pat@x.com',
	emails: [{ address: 'pat@x.com', verified: true }],
	...over,
})

describe('decideOwner', () => {
	it('matches the one user whose primary, verified address it is', () => {
		expect(decideOwner('pat@x.com', [candidate()], JAN + DAY)).toEqual({
			status: 'match',
			userId: 'user_1',
		})
		// Case and spaces don't matter; other users found for other emails
		// are ignored.
		expect(
			decideOwner(
				' Pat@X.com',
				[candidate(), candidate({ id: 'user_2', emails: [] })],
				null,
			),
		).toEqual({ status: 'match', userId: 'user_1' })
	})

	it('refuses an address no Clerk user has', () => {
		expect(decideOwner('sam@x.com', [candidate()], null)).toEqual({
			status: 'no_user',
		})
		expect(decideOwner('sam@x.com', [], null)).toEqual({
			status: 'no_user',
		})
	})

	it('refuses an address more than one user has', () => {
		expect(
			decideOwner(
				'pat@x.com',
				[candidate(), candidate({ id: 'user_2' }), candidate()],
				null,
			),
		).toEqual({ status: 'several_users', userIds: ['user_1', 'user_2'] })
	})

	it("refuses an address that isn't the user's primary one", () => {
		const user = candidate({
			primaryEmail: 'new@x.com',
			emails: [
				{ address: 'pat@x.com', verified: true },
				{ address: 'new@x.com', verified: true },
			],
		})
		expect(decideOwner('pat@x.com', [user], null)).toEqual({
			status: 'not_primary',
			userId: 'user_1',
		})
		expect(
			decideOwner('pat@x.com', [candidate({ primaryEmail: null })], null),
		).toMatchObject({ status: 'not_primary' })
	})

	it('refuses an unverified primary address', () => {
		const user = candidate({
			emails: [{ address: 'pat@x.com', verified: false }],
		})
		expect(decideOwner('pat@x.com', [user], null)).toEqual({
			status: 'unverified',
			userId: 'user_1',
		})
	})

	it('refuses an account newer than the rows: the address may be reused', () => {
		const user = candidate({ createdAt: JAN + 30 * DAY })
		expect(decideOwner('pat@x.com', [user], JAN)).toEqual({
			status: 'account_newer',
			userId: 'user_1',
			createdAt: JAN + 30 * DAY,
			earliest: JAN,
		})
		// Unless the owner checked and allows it.
		expect(
			decideOwner('pat@x.com', [user], JAN, { allowNewerAccounts: true }),
		).toEqual({ status: 'match', userId: 'user_1' })
		// A few minutes of clock difference is not a newer account.
		expect(
			decideOwner(
				'pat@x.com',
				[candidate({ createdAt: JAN + CLOCK_SKEW_MS })],
				JAN,
			),
		).toMatchObject({ status: 'match' })
	})
})

describe('the database statements', () => {
	it.each(
		OWNER_TABLES,
	)('lists the emails with rows that have no user ID in %s', async (table) => {
		const sql = createSqlMock()
		sql.respond(() => [
			{ email: 'pat@x.com', rows: 2, earliest: JAN },
			{ email: 'sam@x.com', rows: '1', earliest: null },
		])
		await expect(
			pendingRows(sql.sql as unknown as Sql, table),
		).resolves.toEqual([
			{ email: 'pat@x.com', rows: 2, earliest: JAN },
			{ email: 'sam@x.com', rows: 1, earliest: null },
		])
		const [query] = sql.queries()
		expect(query.text).toContain(
			`FROM ${table} WHERE clerk_user_id IS NULL`,
		)
		expect(query.values).toEqual([])
	})

	it('reads trip dates as UTC', async () => {
		const sql = createSqlMock()
		await pendingRows(sql.sql as unknown as Sql, 'PTTrips')
		expect(sql.queries()[0].text).toContain("MIN(date) AT TIME ZONE 'UTC'")
	})

	it.each(
		OWNER_TABLES,
	)('sets the user ID only on rows without one in %s', async (table) => {
		const sql = createSqlMock()
		sql.respond(() => [{ n: 3 }])
		await expect(
			setOwner(sql.sql as unknown as Sql, table, 'pat@x.com', 'user_1'),
		).resolves.toBe(3)
		const [query] = sql.queries()
		expect(query.text).toContain(`UPDATE ${table} SET clerk_user_id = ?`)
		expect(query.text).toContain('= ? AND clerk_user_id IS NULL')
		expect(query.values).toEqual(['user_1', 'pat@x.com'])
	})

	it('counts nothing set when nothing came back', async () => {
		const sql = createSqlMock()
		await expect(
			setOwner(sql.sql as unknown as Sql, 'PTTrips', 'a@x.com', 'user_1'),
		).resolves.toBe(0)
	})
})

const clerkUser = (over: Partial<ClerkUser> = {}): ClerkUser => ({
	id: 'user_1',
	createdAt: JAN,
	primaryEmailAddressId: 'idn_1',
	emailAddresses: [
		{
			id: 'idn_1',
			emailAddress: 'pat@x.com',
			verification: { status: 'verified' },
		},
		{ id: 'idn_2', emailAddress: 'old@x.com', verification: null },
	],
	...over,
})

describe('toCandidate', () => {
	it("keeps the user's id, age, primary address and verified addresses", () => {
		expect(toCandidate(clerkUser())).toEqual({
			id: 'user_1',
			createdAt: JAN,
			primaryEmail: 'pat@x.com',
			emails: [
				{ address: 'pat@x.com', verified: true },
				{ address: 'old@x.com', verified: false },
			],
		})
		expect(
			toCandidate(clerkUser({ primaryEmailAddressId: null }))
				.primaryEmail,
		).toBeNull()
	})
})

describe('findClerkUsers', () => {
	const sleep = vi.fn(async () => {})

	it('asks for the emails in batches and reads every page', async () => {
		const getUserList = vi
			.fn<ClerkUsers['getUserList']>()
			.mockResolvedValueOnce({
				data: [clerkUser(), clerkUser({ id: 'user_2' })],
			})
			.mockResolvedValueOnce({ data: [clerkUser({ id: 'user_3' })] })
			.mockResolvedValueOnce({ data: [clerkUser()] })
		const found = await findClerkUsers(
			{ getUserList },
			['a@x.com', 'b@x.com', 'c@x.com'],
			{ batchSize: 2, pageSize: 2, sleep },
		)
		expect(getUserList.mock.calls.map(([p]) => p)).toEqual([
			{ emailAddress: ['a@x.com', 'b@x.com'], limit: 2, offset: 0 },
			{ emailAddress: ['a@x.com', 'b@x.com'], limit: 2, offset: 2 },
			{ emailAddress: ['c@x.com'], limit: 2, offset: 0 },
		])
		// Each user once.
		expect(found.map((u) => u.id)).toEqual(['user_1', 'user_2', 'user_3'])
		expect(sleep).toHaveBeenCalledWith(200)
	})

	it('waits and retries when Clerk rate limits it', async () => {
		const tooMany = (retryAfter?: number) =>
			Object.assign(new Error('Too Many Requests'), {
				status: 429,
				retryAfter,
			})
		const getUserList = vi
			.fn<ClerkUsers['getUserList']>()
			.mockRejectedValueOnce(tooMany(7))
			.mockRejectedValueOnce(tooMany())
			.mockResolvedValueOnce({ data: [clerkUser()] })
		const found = await findClerkUsers({ getUserList }, ['pat@x.com'], {
			sleep,
		})
		expect(found).toHaveLength(1)
		expect(sleep).toHaveBeenCalledWith(7000)
		// Without Retry-After: 1 s, then 2 s, ...
		expect(sleep).toHaveBeenCalledWith(2000)
	})

	it('gives up after the retries, and on any other error', async () => {
		const tooMany = Object.assign(new Error('Too Many Requests'), {
			status: 429,
		})
		const limited = vi.fn().mockRejectedValue(tooMany)
		await expect(
			findClerkUsers({ getUserList: limited }, ['pat@x.com'], {
				maxRetries: 2,
				sleep,
			}),
		).rejects.toBe(tooMany)
		expect(limited).toHaveBeenCalledTimes(3)

		for (const error of [
			Object.assign(new Error('Unauthorized'), { status: 401 }),
			'boom',
			null,
		]) {
			await expect(
				findClerkUsers(
					{ getUserList: vi.fn().mockRejectedValue(error) },
					['pat@x.com'],
					{ sleep },
				),
			).rejects.toBe(error)
		}
	})

	it('pauses between requests by default', async () => {
		vi.useFakeTimers()
		const done = findClerkUsers(
			{ getUserList: async () => ({ data: [] }) },
			['pat@x.com'],
		)
		await vi.runAllTimersAsync()
		await expect(done).resolves.toEqual([])
		vi.useRealTimers()
	})
})

/** A database with these rows without a user ID, per table. */
function fakeDb(
	pending: Partial<
		Record<
			OwnerTable,
			{ email: string; rows: number; earliest: number | null }[] | Error
		>
	>,
) {
	const sql = createSqlMock()
	sql.respond((call) => {
		const table = OWNER_TABLES.find((t) =>
			call.text.includes(`FROM ${t} WHERE clerk_user_id IS NULL`),
		)
		if (table) return pending[table] ?? []
		const updated = OWNER_TABLES.find((t) =>
			call.text.includes(`UPDATE ${t} SET`),
		) as OwnerTable
		const rows = pending[updated] as { email: string; rows: number }[]
		return [{ n: rows.find((r) => r.email === call.values[1])?.rows ?? 0 }]
	})
	return sql
}

const users = (list: ClerkUser[]): ClerkUsers => ({
	getUserList: async ({ emailAddress }) => ({
		data: list.filter((u) =>
			u.emailAddresses.some((e) => emailAddress.includes(e.emailAddress)),
		),
	}),
})

const lookup = { sleep: async () => {} }
const missingTable = Object.assign(new Error('no table'), { code: '42P01' })

describe('runBackfill', () => {
	const pending = {
		PTTrips: [
			{ email: 'pat@x.com', rows: 3, earliest: JAN + DAY },
			{ email: 'gone@x.com', rows: 2, earliest: JAN },
		],
		pt_trip_signatures: [{ email: 'pat@x.com', rows: 2, earliest: JAN }],
		pt_email_settings: [{ email: 'pat@x.com', rows: 1, earliest: null }],
	}

	it('writes nothing in a dry run, and says what it would do', async () => {
		const sql = fakeDb(pending)
		const report = await runBackfill({
			sql: sql.sql as unknown as Sql,
			users: users([clerkUser()]),
			lookup,
		})
		expect(sql.queries().some((q) => q.text.includes('UPDATE'))).toBe(false)
		expect(report.apply).toBe(false)
		expect(report.tables.map((t) => t.table)).toEqual([...OWNER_TABLES])
		expect(report.tables[0]).toEqual({
			table: 'PTTrips',
			pending: 5,
			set: 3,
			skipped: 2,
		})
		expect(report.tables[2]).toMatchObject({ pending: 2, set: 2 })
		expect(report.emails).toEqual([
			{
				email: 'gone@x.com',
				rows: { PTTrips: 2 },
				decision: { status: 'no_user' },
			},
			{
				email: 'pat@x.com',
				rows: {
					PTTrips: 3,
					pt_trip_signatures: 2,
					pt_email_settings: 1,
				},
				decision: { status: 'match', userId: 'user_1' },
			},
		])
	})

	it('with apply, sets the user ID on the matched emails only', async () => {
		const sql = fakeDb(pending)
		const report = await runBackfill({
			sql: sql.sql as unknown as Sql,
			users: users([clerkUser()]),
			apply: true,
			lookup,
		})
		const updates = sql.queries().filter((q) => q.text.includes('UPDATE'))
		expect(updates.map((q) => q.values)).toEqual([
			['user_1', 'pat@x.com'],
			['user_1', 'pat@x.com'],
			['user_1', 'pat@x.com'],
		])
		expect(report.tables[0]).toMatchObject({ set: 3, skipped: 2 })
	})

	it("uses the email's oldest row in any table to spot a newer account", async () => {
		const sql = fakeDb(pending)
		const report = await runBackfill({
			sql: sql.sql as unknown as Sql,
			// Created after the signature row (JAN) but before the trips.
			users: users([clerkUser({ createdAt: JAN + DAY })]),
			lookup,
		})
		expect(report.emails[1].decision).toMatchObject({
			status: 'account_newer',
			earliest: JAN,
		})
		const allowed = await runBackfill({
			sql: sql.sql as unknown as Sql,
			users: users([clerkUser({ createdAt: JAN + DAY })]),
			allowNewerAccounts: true,
			lookup,
		})
		expect(allowed.emails[1].decision.status).toBe('match')
	})

	it("skips a table that doesn't exist, and asks nobody with nothing to do", async () => {
		const sql = fakeDb({ pt_email_sends: missingTable })
		const getUserList = vi.fn()
		const report = await runBackfill({
			sql: sql.sql as unknown as Sql,
			users: { getUserList },
			lookup,
		})
		expect(getUserList).not.toHaveBeenCalled()
		expect(report.emails).toEqual([])
		expect(report.tables[5]).toEqual({
			table: 'pt_email_sends',
			missing: true,
			pending: 0,
			set: 0,
			skipped: 0,
		})
	})

	it('stops before anything when the migration has not run', async () => {
		const sql = fakeDb({
			pt_defect_repairs: Object.assign(new Error('no column'), {
				code: '42703',
			}),
		})
		const run = runBackfill({
			sql: sql.sql as unknown as Sql,
			users: users([]),
			apply: true,
			lookup,
		})
		await expect(run).rejects.toBeInstanceOf(MigrationMissingError)
		await expect(run).rejects.toThrow(
			'pt_defect_repairs has no clerk_user_id column. Run src/lib/sql/2026-11-18-clerk-user-id.sql first.',
		)
		expect(sql.queries().some((q) => q.text.includes('UPDATE'))).toBe(false)
	})

	it('passes on any other database error', async () => {
		const down = new Error('fetch failed')
		await expect(
			runBackfill({
				sql: fakeDb({ PTTrips: down }).sql as unknown as Sql,
				users: users([]),
				lookup,
			}),
		).rejects.toBe(down)
		await expect(
			runBackfill({
				sql: (async () => {
					throw 'down'
				}) as unknown as Sql,
				users: users([]),
				lookup,
			}),
		).rejects.toBe('down')
	})
})

describe('the report', () => {
	it('explains every decision', () => {
		expect(explain({ status: 'match', userId: 'user_1' })).toBe(
			'Clerk user user_1',
		)
		expect(explain({ status: 'no_user' })).toContain('no Clerk user')
		expect(
			explain({ status: 'several_users', userIds: ['user_1', 'user_2'] }),
		).toContain('(user_1, user_2)')
		expect(explain({ status: 'not_primary', userId: 'user_1' })).toContain(
			'not as their primary address',
		)
		expect(explain({ status: 'unverified', userId: 'user_1' })).toContain(
			'not verified',
		)
		expect(
			explain({
				status: 'account_newer',
				userId: 'user_1',
				createdAt: JAN + DAY,
				earliest: JAN,
			}),
		).toBe(
			"Clerk user user_1 was created 2026-01-02T00:00:00.000Z, after this address's oldest row (2026-01-01T00:00:00.000Z): the address may have been reused by someone else",
		)
	})

	it('prints the counts per table and each email', () => {
		const report = {
			apply: false,
			tables: [
				{ table: 'PTTrips' as const, pending: 5, set: 3, skipped: 2 },
				{
					table: 'pt_email_sends' as const,
					missing: true,
					pending: 0,
					set: 0,
					skipped: 0,
				},
			],
			emails: [
				{
					email: 'pat@x.com',
					rows: { PTTrips: 3 },
					decision: { status: 'match' as const, userId: 'user_1' },
				},
				{
					email: 'gone@x.com',
					rows: { PTTrips: 2 },
					decision: { status: 'no_user' as const },
				},
			],
		}
		const lines = formatReport(report)
		expect(lines[0]).toContain('DRY RUN')
		expect(lines).toContain(
			'  PTTrips: 5 pending, 3 would be set, 2 refused',
		)
		expect(lines).toContain(
			'  pt_email_sends: table does not exist, skipped',
		)
		expect(lines).toContain('  pat@x.com -> Clerk user user_1 (PTTrips 3)')
		expect(lines.join('\n')).toContain('1 email(s) refused')
		expect(lines.join('\n')).toContain('  gone@x.com: no Clerk user')

		const applied = formatReport({ ...report, apply: true })
		expect(applied[0]).toContain('APPLIED')
		expect(applied).toContain('  PTTrips: 5 pending, 3 set, 2 refused')
	})
})
