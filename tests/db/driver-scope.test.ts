import { describe, expect, test } from 'vitest'
import {
	type AllowEntry,
	checkSources,
	checkStatement,
	findSqlStatements,
	readMigrations,
	sourceFiles,
	type Tables,
} from '../helpers/driver-scope'

/*
 * EVERY QUERY ON A DRIVER-OWNED TABLE FILTERS BY THE DRIVER.
 *
 * The database has no row-level security: the app connects with one role
 * that can read and change every driver's rows. A driver only ever sees their
 * own because each statement limits each driver-owned table it touches to the
 * signed-in driver. This test reads every sql`...` statement in src/ and
 * scripts/ (with the TypeScript compiler API) and fails when one doesn't.
 *
 * For every reference to a driver-owned table (in FROM, JOIN, UPDATE,
 * DELETE FROM, INSERT INTO, in a CTE or a subquery) the statement must:
 *
 * - read/update/delete: have `[alias.]<owner> = ${driverEmail}` as a
 *   condition that holds on every path through its WHERE (or the table's own
 *   JOIN ... ON): a top-level AND term, or one in every OR branch. The value
 *   must be a bound `${...}` whose expression names an email (driverEmail,
 *   email, owner.email), not a literal, another column or another id.
 * - or reach the rows through a table or CTE in the same statement that is
 *   itself limited that way, joined on a key: the same table's key, the
 *   table's key = the limited row's foreign key to it, or the table's foreign
 *   key = the limited row's key (as in `pt_defect_repairs r JOIN PTTrips t
 *   ON t.tripId = r.trip_id WHERE r.driver_email = ...`).
 * - insert: list its columns, and take <owner> from the driver's bound email
 *   or from the owner column of a row the statement limits to the driver;
 *   take each foreign key (`refs` below) from the key of such a row, never
 *   from a bound value (so a repair or signature can't be attached to another
 *   driver's trip).
 * - never SET the owner column or a foreign key, and only use ON CONFLICT DO
 *   UPDATE with the owner column in the conflict target.
 *
 * A statement that names a table not listed below, uses a retired table, or
 * that the checker can't read fails too. So does SQL written any other way
 * (a plain string, sql.query(), sql.unsafe(), a fragment inside `${...}`).
 *
 * Adding a table: add one line to TABLES (and its migration under
 * src/lib/sql/, which this test also reads). Adding a query that really must
 * cross drivers: add an entry to ALLOW with a one-line reason; it is reviewed
 * like any other change. An entry that no longer excuses anything fails, so
 * remove it when the query is fixed. The checker is tests/helpers/driver-scope.ts.
 */

/*
 * Every table the app's SQL may name, lower case (Postgres folds unquoted
 * names). ADD A NEW TABLE HERE, deciding whether a driver owns its rows:
 * `owner` is the column naming the driver, `key` the column identifying one
 * row, `refs` the columns pointing at another table's key.
 */
const TABLES: Tables = {
	pttrips: { kind: 'driver', owner: 'driveremail', key: 'tripid' },
	pt_defect_repairs: {
		kind: 'driver',
		owner: 'driver_email',
		key: 'id',
		refs: { trip_id: 'pttrips' },
	},
	pt_trip_signatures: {
		kind: 'driver',
		owner: 'driver_email',
		key: 'trip_id',
		refs: { trip_id: 'pttrips' },
	},
	pt_driver_signatures: {
		kind: 'driver',
		owner: 'driver_email',
		key: 'driver_email',
	},
	pt_email_settings: {
		kind: 'driver',
		owner: 'driver_email',
		key: 'driver_email',
	},
	pt_email_sends: { kind: 'driver', owner: 'driver_email', key: 'id' },
	pt_vehicles: { kind: 'driver', owner: 'driver_email', key: 'id' },
	// Append-only. Its trip_id and repair_id are deliberately not foreign keys,
	// so an event outlives the row it describes.
	pt_audit_events: { kind: 'driver', owner: 'driver_email', key: 'id' },
	pt_rate_limits: {
		kind: 'not-driver',
		why: 'counters keyed by a bucket string; holds no driver data',
	},
	pt_api_keys: {
		kind: 'retired',
		why: 'personal API keys were removed (src/lib/sql/2026-11-18-revoke-api-keys.sql)',
	},
}

/*
 * Statements that legitimately aren't limited to one driver. Keyed by file
 * and enclosing function (`fn` also covers its `fn#case` statements).
 */
const ALLOW: AllowEntry[] = [
	{
		file: 'src/lib/backfill/clerk-user-ids.ts',
		fn: 'pendingRows',
		why: 'the operator-run Clerk user ID backfill counts every driver’s unstamped rows; never reachable from a request',
	},
]

const report = checkSources(sourceFiles(['src', 'scripts']), TABLES, ALLOW)

const describeFinding = (f: {
	file: string
	line: number
	fn: string
	message: string
}) => `${f.file}:${f.line} (${f.fn}): ${f.message}`

describe('driver scoping of the app’s SQL', () => {
	test('finds the app’s statements', () => {
		const fns = new Set(report.statements.map((s) => `${s.file} ${s.fn}`))
		for (const expected of [
			'src/lib/db/trips.ts createTripDb',
			'src/lib/db/trips.ts getTripDb',
			'src/lib/db/trips.ts updateTripDb',
			'src/lib/db/repairs.ts createRepairDb',
			'src/lib/db/repairs.ts deleteRepairDb',
			'src/lib/db/signatures.ts signTripDb',
			'src/lib/db/email-sends.ts reserveEmailSendDb',
			'src/lib/db/email-settings.ts saveEmailSettingsDb',
			'src/lib/db/owner-stamps.ts runStamp#repair',
			'src/lib/db/rate-limits.ts countHitDb',
			'src/lib/backfill/clerk-user-ids.ts setOwner#PTTrips',
		]) {
			expect(fns).toContain(expected)
		}
		// 49 when this test was written; it only grows as queries are added.
		expect(report.statements.length).toBeGreaterThanOrEqual(45)
	})

	test('every statement limits driver-owned tables to the driver', () => {
		expect(report.failures.map(describeFinding)).toEqual([])
	})

	test('every allow-list entry still excuses something', () => {
		expect(report.stale.map((e) => `${e.file} ${e.fn}`)).toEqual([])
	})

	test('only the allow-listed statements are excused', () => {
		const excused = [
			...new Set(report.excused.map((f) => `${f.file} ${f.fn}`)),
		].sort()
		expect(excused).toEqual([
			'src/lib/backfill/clerk-user-ids.ts pendingRows#PTTrips',
			'src/lib/backfill/clerk-user-ids.ts pendingRows#pt_defect_repairs',
			'src/lib/backfill/clerk-user-ids.ts pendingRows#pt_driver_signatures',
			'src/lib/backfill/clerk-user-ids.ts pendingRows#pt_email_sends',
			'src/lib/backfill/clerk-user-ids.ts pendingRows#pt_email_settings',
			'src/lib/backfill/clerk-user-ids.ts pendingRows#pt_trip_signatures',
		])
	})

	// The statements with CTEs and joins pass for the reasons expected.
	test.each([
		[
			'src/lib/db/trips.ts',
			'createTripDb',
			[
				'insert into pttrips: driveremail from $1',
				'insert into pt_trip_signatures: driver_email from pttrips.driveremail (trip_id from a limited row)',
			],
		],
		[
			'src/lib/db/signatures.ts',
			'signTripDb',
			[
				'pttrips: driveremail = $2',
				'insert into pt_trip_signatures: driver_email from pttrips.driveremail (trip_id from a limited row)',
			],
		],
		[
			'src/lib/db/repairs.ts',
			'createRepairDb',
			[
				'pttrips t: t.driveremail = $17',
				'insert into pt_defect_repairs: driver_email from $1 (trip_id from a limited row)',
			],
		],
		[
			'src/lib/db/repairs.ts',
			'listDriverRepairsDb',
			[
				'pt_defect_repairs r: r.driver_email = $1',
				'pttrips t: joined on tripid = r.trip_id',
			],
		],
		[
			'src/lib/db/trips.ts',
			'updateTripDb',
			[
				// target: the trip, limited to the driver and locked.
				'pttrips: driveremail = $8',
				// updated: the same row as target (it also repeats the filter).
				'pttrips: joined on tripid = target.tripid',
			],
		],
		[
			'src/lib/db/email-sends.ts',
			'reserveEmailSendDb',
			[
				'pt_email_sends: driver_email = $6',
				'insert into pt_email_sends: driver_email from $1',
			],
		],
	] as const)('%s %s passes for the right reasons', (file, fn, expected) => {
		const stmts = report.statements.filter(
			(s) => s.file === file && s.fn === fn,
		)
		const trace = stmts.flatMap((s) => checkStatement(s, TABLES).trace)
		expect(trace).toEqual(expected)
	})
})

describe('TABLES matches the migrations in src/lib/sql', () => {
	const migrations = readMigrations('src/lib/sql')

	test('every table a migration creates is in TABLES, and the other way round', () => {
		expect([...migrations.keys()].sort()).toEqual(
			Object.keys(TABLES).sort(),
		)
	})

	test.each(
		Object.entries(TABLES).filter(([, r]) => r.kind === 'driver'),
	)('%s has the owner, key and foreign keys TABLES says', (name, rule) => {
		const m = migrations.get(name)
		if (rule.kind !== 'driver' || !m) throw new Error(`${name} missing`)
		expect(m.columns).toContain(rule.owner)
		expect(m.columns).toContain(rule.key)
		expect(Object.fromEntries(m.references)).toEqual(rule.refs ?? {})
	})
})

/* ---- The checker has teeth: small samples ---- */

/**
 * Runs the checker over one statement written as it would be in the app.
 * `:name` stands for a `${name}` hole (so these strings needn't contain
 * `${`); `::type` casts are left alone.
 */
function check(sqlText: string, tag = 'sql', allow: AllowEntry[] = []) {
	const body = sqlText.replace(
		/(?<![:\w]):([A-Za-z_][\w.]*)/g,
		(_, name) => `\${${name}}`,
	)
	const source = `async function sample(driverEmail, tripId, id, other) {\n\treturn ${tag}\`${body}\`\n}\n`
	return checkSources([{ file: 'sample.ts', source }], TABLES, allow)
}
const messages = (sqlText: string, tag?: string) =>
	check(sqlText, tag).failures.map((f) => f.message)
const passes = (sqlText: string) => expect(messages(sqlText)).toEqual([])
const fails = (sqlText: string, pattern: RegExp) => {
	const m = messages(sqlText)
	expect(m.length).toBeGreaterThan(0)
	expect(m.join('\n')).toMatch(pattern)
}

describe('checker samples', () => {
	test('a correct query passes; without the driver filter it fails', () => {
		passes(
			'SELECT * FROM PTTrips WHERE tripId = :tripId AND driverEmail = :driverEmail',
		)
		fails(
			'SELECT * FROM PTTrips WHERE tripId = :tripId',
			/reads pttrips without limiting it/,
		)
	})

	test('the filter only in the SELECT list or RETURNING fails', () => {
		fails(
			'SELECT driverEmail = :driverEmail AS mine FROM PTTrips WHERE tripId = :tripId',
			/reads pttrips/,
		)
		fails(
			'DELETE FROM pt_defect_repairs WHERE id = :id RETURNING driver_email = :driverEmail',
			/changes pt_defect_repairs/,
		)
	})

	test('comparing to a literal, another column or another value fails', () => {
		fails(
			"SELECT * FROM pt_email_settings WHERE driver_email = 'a@b.c'",
			/reads pt_email_settings/,
		)
		fails(
			'SELECT * FROM pt_email_settings WHERE driver_email = driver_email',
			/reads pt_email_settings/,
		)
		fails(
			'SELECT * FROM pt_email_settings WHERE driver_email = :tripId',
			/reads pt_email_settings/,
		)
		fails(
			'SELECT * FROM pt_email_settings WHERE driver_email <> :driverEmail',
			/reads pt_email_settings/,
		)
		fails(
			'SELECT * FROM pt_email_settings WHERE driver_email = :driverEmail || :other',
			/reads pt_email_settings/,
		)
	})

	test('an OR that defeats the filter fails; one that keeps it in every branch passes', () => {
		fails(
			'SELECT * FROM pt_trip_signatures WHERE trip_id = :tripId OR driver_email = :driverEmail',
			/reads pt_trip_signatures/,
		)
		fails(
			'SELECT * FROM pt_trip_signatures WHERE trip_id = :tripId AND driver_email = :driverEmail OR trip_id = :id',
			/reads pt_trip_signatures/,
		)
		fails(
			'SELECT * FROM pt_trip_signatures WHERE NOT (driver_email = :driverEmail)',
			/reads pt_trip_signatures/,
		)
		passes(
			'SELECT * FROM pt_trip_signatures WHERE (trip_id = :tripId AND driver_email = :driverEmail) OR (trip_id = :id AND driver_email = :driverEmail)',
		)
		passes(
			'SELECT * FROM pt_trip_signatures WHERE (trip_id = :tripId OR trip_id = :id) AND driver_email = :driverEmail',
		)
	})

	test('a filter on the wrong alias fails', () => {
		fails(
			'SELECT b.* FROM PTTrips a JOIN PTTrips b ON b.odometer = a.odometer WHERE a.driverEmail = :driverEmail',
			/reads pttrips b/,
		)
		fails(
			'SELECT s.* FROM pt_email_settings e, pt_driver_signatures s WHERE e.driver_email = :driverEmail',
			/reads pt_driver_signatures s/,
		)
	})

	test('a join on a key to a limited table or CTE passes; a join on another column fails', () => {
		passes(
			'SELECT r.* FROM pt_defect_repairs r JOIN PTTrips t ON t.tripId = r.trip_id WHERE t.driverEmail = :driverEmail',
		)
		passes(`
			WITH mine AS (SELECT tripId FROM PTTrips WHERE driverEmail = :driverEmail)
			SELECT s.* FROM pt_trip_signatures s JOIN mine ON s.trip_id = mine.tripId
		`)
		fails(
			'SELECT r.* FROM pt_defect_repairs r JOIN PTTrips t ON t.odometer = r.id WHERE t.driverEmail = :driverEmail',
			/reads pt_defect_repairs r/,
		)
		// LEFT JOIN: the left table isn't limited by the right one's ON.
		fails(
			'SELECT r.* FROM pt_defect_repairs r LEFT JOIN PTTrips t ON t.tripId = r.trip_id AND t.driverEmail = :driverEmail',
			/reads pt_defect_repairs r/,
		)
		// A CTE that isn't limited doesn't limit what is joined to it.
		fails(
			`WITH every AS (SELECT tripId FROM PTTrips WHERE odometer > 0)
			SELECT s.* FROM pt_trip_signatures s JOIN every ON s.trip_id = every.tripId`,
			/reads pttrips/,
		)
	})

	test('inserts take the owner from the driver and foreign keys from a limited row', () => {
		passes(
			'INSERT INTO pt_email_settings (driver_email, recipients) VALUES (:driverEmail, :other)',
		)
		fails(
			'INSERT INTO pt_email_settings (driver_email, recipients) VALUES (:other, :other)',
			/driver_email from something other/,
		)
		fails(
			"INSERT INTO pt_email_settings (driver_email) VALUES ('x@y.z')",
			/driver_email from something other/,
		)
		fails(
			'INSERT INTO pt_email_settings (recipients) VALUES (:other)',
			/without setting driver_email/,
		)
		fails(
			'INSERT INTO pt_email_settings VALUES (:driverEmail, :other)',
			/without a column list/,
		)
		fails(
			'INSERT INTO pt_trip_signatures (trip_id, driver_email, signature) VALUES (:tripId, :driverEmail, :other)',
			/trip_id from a bound value/,
		)
		passes(`
			INSERT INTO pt_defect_repairs (trip_id, driver_email, defect)
			SELECT t.tripId, :driverEmail, :other FROM PTTrips t WHERE t.tripId = :tripId AND t.driverEmail = :driverEmail
		`)
		fails(
			`INSERT INTO pt_defect_repairs (trip_id, driver_email, defect)
			SELECT t.tripId, :driverEmail, :other FROM PTTrips t WHERE t.tripId = :tripId`,
			/reads pttrips t/,
		)
	})

	test('ON CONFLICT DO UPDATE must target the owner; SET may not move a row', () => {
		passes(`
			INSERT INTO pt_driver_signatures (driver_email, signature) VALUES (:driverEmail, :other)
			ON CONFLICT (driver_email) DO UPDATE SET signature = EXCLUDED.signature
		`)
		fails(
			`INSERT INTO pt_defect_repairs (id, driver_email) VALUES (:id, :driverEmail)
			ON CONFLICT (id) DO UPDATE SET notes = :other`,
			/conflict target/,
		)
		fails(
			'UPDATE pt_defect_repairs SET driver_email = :other WHERE id = :id AND driver_email = :driverEmail',
			/sets pt_defect_repairs.driver_email/,
		)
	})

	test('CTEs, subqueries and set operations are each checked', () => {
		fails(
			`WITH t AS (UPDATE PTTrips SET signed_at = NOW() WHERE tripId = :tripId RETURNING *)
			SELECT * FROM t`,
			/changes pttrips/,
		)
		fails(
			'SELECT * FROM pt_email_settings WHERE driver_email = :driverEmail AND EXISTS (SELECT 1 FROM PTTrips)',
			/reads pttrips/,
		)
		fails(
			`SELECT tripId FROM PTTrips WHERE driverEmail = :driverEmail
			UNION SELECT trip_id FROM pt_defect_repairs`,
			/reads pt_defect_repairs/,
		)
	})

	test('comments and string literals are not read as SQL', () => {
		fails(
			'SELECT * FROM PTTrips WHERE tripId = :tripId -- AND driverEmail = :driverEmail\n',
			/reads pttrips/,
		)
		fails(
			"SELECT * FROM PTTrips WHERE tripId = :tripId AND remarks = 'AND driverEmail = x'",
			/reads pttrips/,
		)
	})

	test('an unknown or retired table fails', () => {
		fails(
			'SELECT * FROM pt_new_feature WHERE driver_email = :driverEmail',
			/unknown table "pt_new_feature"/,
		)
		fails(
			'SELECT * FROM drivers WHERE email = :driverEmail',
			/unknown table "drivers"/,
		)
		fails(
			'SELECT * FROM pt_api_keys WHERE driver_email = :driverEmail',
			/retired/,
		)
		fails('TRUNCATE PTTrips', /only understands SELECT/)
	})

	test('adding a table to TABLES is one line', () => {
		const insert =
			'INSERT INTO pt_new_feature (driver_email, action) VALUES (:driverEmail, :other)'
		expect(messages(insert).join()).toMatch(
			/unknown table "pt_new_feature"/,
		)
		const withAudit: Tables = {
			...TABLES,
			pt_new_feature: {
				kind: 'driver',
				owner: 'driver_email',
				key: 'id',
			},
		}
		const source = `async function f(driverEmail, other) { return sql\`${insert.replace(/:(\w+)/g, (_, n) => `\${${n}}`)}\` }`
		expect(
			checkSources([{ file: 'a.ts', source }], withAudit, []).failures,
		).toEqual([])
	})

	test('BETWEEN ... AND and CASE ... END inside a WHERE are kept whole', () => {
		passes(
			'SELECT * FROM pt_email_sends WHERE created_at BETWEEN :id AND :other AND driver_email = :driverEmail',
		)
		fails(
			"SELECT * FROM pt_email_sends WHERE CASE WHEN status = 'sent' AND driver_email = :driverEmail THEN true ELSE true END",
			/reads pt_email_sends/,
		)
	})

	test('SQL the checker cannot see fails', () => {
		const run = (source: string) =>
			checkSources(
				[{ file: 'sample.ts', source }],
				TABLES,
				[],
			).failures.map((f) => f.message)
		expect(run("const q = 'SELECT * FROM PTTrips'").join()).toMatch(
			/outside a `sql` tagged template/,
		)
		expect(run('const q = query`SELECT * FROM PTTrips`').join()).toMatch(
			/not a known SQL tag/,
		)
		expect(run("await sql.query('SELECT 1')").join()).toMatch(/cannot read/)
		expect(run('await sql.unsafe(text)').join()).toMatch(/cannot read/)
		expect(
			// sql`SELECT * FROM PTTrips <hole: sql`WHERE driverEmail = <hole: driverEmail>`>`
			run(
				[
					'await sql`SELECT * FROM PTTrips $',
					'{sql`WHERE driverEmail = $',
					'{driverEmail}`}`',
				].join(''),
			).join(),
		).toMatch(/nested inside/)
	})

	test('the allow-list excuses by file and function, and a stale entry is reported', () => {
		const entry = { file: 'sample.ts', fn: 'sample', why: 'test' }
		const unscoped = check('SELECT * FROM PTTrips', 'sql', [entry])
		expect(unscoped.failures).toEqual([])
		expect(unscoped.stale).toEqual([])
		const scoped = check(
			'SELECT * FROM PTTrips WHERE driverEmail = :driverEmail',
			'sql',
			[entry],
		)
		expect(scoped.failures).toEqual([])
		expect(scoped.stale).toEqual([entry])
		const otherFn = check('SELECT * FROM PTTrips', 'sql', [
			{ ...entry, fn: 'samples' },
		])
		expect(otherFn.failures).toHaveLength(1)
	})

	test('findings name the file, line and function', () => {
		const { statements } = findSqlStatements(
			'x.ts',
			'export async function getThing(driverEmail) {\n\treturn sql`\n\t\tSELECT *\n\t\tFROM PTTrips\n\t`\n}\n',
		)
		expect(statements).toHaveLength(1)
		const r = checkSources(
			[
				{
					file: 'x.ts',
					source: 'export async function getThing(driverEmail) {\n\treturn sql`\n\t\tSELECT *\n\t\tFROM PTTrips\n\t`\n}\n',
				},
			],
			TABLES,
			[],
		)
		expect(r.failures.map(describeFinding)).toEqual([
			expect.stringMatching(
				/^x\.ts:3 \(getThing\): reads pttrips without limiting it/,
			),
		])
	})
})
