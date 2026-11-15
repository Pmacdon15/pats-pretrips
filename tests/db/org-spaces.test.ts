import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

/*
 * An organization's shared vehicles, carriers and email settings
 * (src/lib/sql/2026-11-22-organizations.sql, docs/organizations.md). Every
 * statement is keyed by the organization; tests/db/driver-scope.test.ts
 * checks that statically, these check what is sent.
 */

const mocks = vi.hoisted(() => ({
	neon: vi.fn(),
	cacheTag: vi.fn(),
	cacheLife: vi.fn(),
}))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))
vi.mock('next/cache', () => ({
	cacheTag: mocks.cacheTag,
	cacheLife: mocks.cacheLife,
}))

import {
	createOrgCarrierDb,
	deleteOrgCarrierDb,
	listOrgCarriersOrNone,
	resetOrgCarrierWarnings,
	updateOrgCarrierDb,
} from '@/lib/db/carriers'
import {
	getOrgEmailSettingsOrNone,
	NO_EMAIL_SETTINGS,
	resetOrgEmailSettingsWarnings,
	saveOrgEmailSettingsDb,
} from '@/lib/db/email-settings'
import {
	createOrgVehicleDb,
	deleteOrgVehicleDb,
	listOrgVehiclesOrNone,
	resetOrgVehicleWarnings,
	updateOrgVehicleDb,
} from '@/lib/db/vehicles'

const sql = createSqlMock()
const admin = { email: 'boss@x.com', userId: 'user_9' }
const missing = () => Object.assign(new Error('missing'), { code: '42P01' })

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	resetOrgVehicleWarnings()
	resetOrgCarrierWarnings()
	resetOrgEmailSettingsWarnings()
})

const vehicle = {
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: null,
	trailer_plate_b: null,
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}

describe("an organization's vehicles", () => {
	it('lists them, cached per organization', async () => {
		sql.respond(() => [vehicle])
		await expect(listOrgVehiclesOrNone('org_1')).resolves.toEqual([vehicle])
		expect(mocks.cacheTag).toHaveBeenCalledWith('org-vehicles:org_1')
		const [query] = sql.queries()
		expect(query.text).toContain('FROM pt_org_vehicles')
		expect(query.text).toContain('WHERE clerk_org_id = ?')
		expect(query.values).toEqual(['org_1', 50])
	})

	it('lists none, logging once, before the migration', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => missing())
		await expect(listOrgVehiclesOrNone('org_1')).resolves.toEqual([])
		await expect(listOrgVehiclesOrNone('org_1')).resolves.toEqual([])
		expect(log).toHaveBeenCalledTimes(1)
		expect(log.mock.calls[0][0]).toMatch(/2026-11-22-organizations.sql/)
	})

	it('lists none, logging each error, when the read fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => new Error('down'))
		await expect(listOrgVehiclesOrNone('org_1')).resolves.toEqual([])
		expect(log.mock.calls[0][0]).toMatch(/could not list them/)
	})

	it('adds one under the organization, noting the admin, within the limit', async () => {
		sql.respond(() => [vehicle])
		await expect(
			createOrgVehicleDb('org_1', admin, {
				name: ' Unit 42 ',
				make: 'Volvo',
				model: 'VNL',
				truckPlate: '',
			}),
		).resolves.toEqual(vehicle)
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_org_vehicles')
		expect(query.values.slice(0, 4)).toEqual([
			'org_1',
			'boss@x.com',
			'user_9',
			'Unit 42',
		])
		expect(query.values.slice(-2)).toEqual(['org_1', 50])

		sql.respond(() => [])
		await expect(
			createOrgVehicleDb(
				'org_1',
				{ email: 'boss@x.com' },
				{ make: 'A', model: 'B' },
			),
		).resolves.toBe('too_many')
		// Without a known Clerk user ID, none is recorded.
		expect(sql.queries()[1].values[2]).toBeNull()
	})

	it('changes and deletes only the organization’s', async () => {
		sql.respond(() => [
			{ ...vehicle, before_name: 'Old', before_make: 'Volvo' },
		])
		const updated = await updateOrgVehicleDb(3, 'org_1', {
			name: 'Unit 42',
		})
		expect(updated?.vehicle).toEqual(vehicle)
		expect(updated?.before).toEqual({ name: 'Old', make: 'Volvo' })
		const [update] = sql.queries()
		expect(update.text).toContain('AND clerk_org_id = ?')
		expect(update.values).toContain('org_1')

		sql.respond(() => [])
		await expect(
			updateOrgVehicleDb(3, 'org_2', { name: 'x' }),
		).resolves.toBeUndefined()

		sql.reset()
		mocks.neon.mockReturnValue(sql.sql)
		sql.respond(() => [vehicle])
		await expect(deleteOrgVehicleDb(3, 'org_1')).resolves.toEqual(vehicle)
		const [del] = sql.queries()
		expect(del.text).toContain('DELETE FROM pt_org_vehicles')
		expect(del.values).toEqual([3, 'org_1'])
	})
})

const carrier = {
	id: 5,
	name: 'Acme Freight',
	address: '12 Depot Rd',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}

describe("an organization's carriers", () => {
	it('lists them, cached per organization, or none before the migration', async () => {
		sql.respond(() => [carrier])
		await expect(listOrgCarriersOrNone('org_1')).resolves.toEqual([carrier])
		expect(mocks.cacheTag).toHaveBeenCalledWith('org-carriers:org_1')
		expect(sql.queries()[0].text).toContain('FROM pt_org_carriers')

		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => missing())
		await expect(listOrgCarriersOrNone('org_1')).resolves.toEqual([])
		expect(log.mock.calls[0][0]).toMatch(/pt_org_carriers table is missing/)
		await listOrgCarriersOrNone('org_1')
		expect(log).toHaveBeenCalledTimes(1)
		sql.respond(() => new Error('down'))
		await expect(listOrgCarriersOrNone('org_1')).resolves.toEqual([])
		expect(log.mock.calls[1][0]).toMatch(/could not list them/)
	})

	it('adds, changes and deletes them under the organization', async () => {
		sql.respond(() => [carrier])
		await expect(
			createOrgCarrierDb('org_1', admin, {
				name: ' Acme Freight ',
				address: '12 Depot Rd',
			}),
		).resolves.toEqual(carrier)
		expect(sql.queries()[0].values.slice(0, 4)).toEqual([
			'org_1',
			'boss@x.com',
			'user_9',
			'Acme Freight',
		])

		sql.respond(() => [
			{ ...carrier, before_name: 'Acme', before_address: '1 Old St' },
		])
		await expect(
			updateOrgCarrierDb(5, 'org_1', {
				name: 'Acme Freight',
				address: '12 Depot Rd',
			}),
		).resolves.toEqual({
			carrier,
			before: { name: 'Acme', address: '1 Old St' },
		})

		sql.respond(() => [])
		await expect(
			createOrgCarrierDb(
				'org_1',
				{ email: 'boss@x.com', userId: null },
				{ name: 'a', address: 'b' },
			),
		).resolves.toBe('too_many')
		expect(sql.queries().at(-1)?.values[2]).toBeNull()
		await expect(
			updateOrgCarrierDb(5, 'org_2', { name: 'a', address: 'b' }),
		).resolves.toBeUndefined()
		await expect(deleteOrgCarrierDb(5, 'org_2')).resolves.toBeUndefined()
		expect(sql.queries().at(-1)?.values).toEqual([5, 'org_2'])
	})
})

describe("an organization's email settings", () => {
	it('reads them, or none saved yet', async () => {
		sql.respond(() => [
			{
				recipients: 'a@x.com,b@x.com',
				auto_send: true,
				time_zone: 'UTC',
			},
		])
		await expect(getOrgEmailSettingsOrNone('org_1')).resolves.toEqual({
			recipients: ['a@x.com', 'b@x.com'],
			autoSend: true,
			timeZone: 'UTC',
		})
		expect(sql.queries()[0].text).toContain(
			'FROM pt_org_email_settings WHERE clerk_org_id = ?',
		)
		sql.respond(() => [])
		await expect(getOrgEmailSettingsOrNone('org_1')).resolves.toEqual(
			NO_EMAIL_SETTINGS,
		)
	})

	it('has none, logging once, before the migration; other errors throw', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => missing())
		await expect(getOrgEmailSettingsOrNone('org_1')).resolves.toEqual(
			NO_EMAIL_SETTINGS,
		)
		await getOrgEmailSettingsOrNone('org_1')
		expect(log).toHaveBeenCalledTimes(1)
		sql.respond(() => new Error('down'))
		await expect(getOrgEmailSettingsOrNone('org_1')).rejects.toThrow('down')
	})

	it('saves them for the organization, noting the admin', async () => {
		const settings = {
			recipients: ['a@x.com', 'b@x.com'],
			autoSend: true,
			timeZone: null,
		}
		await expect(
			saveOrgEmailSettingsDb('org_1', admin, settings),
		).resolves.toEqual(settings)
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_org_email_settings')
		expect(query.text).toContain('ON CONFLICT (clerk_org_id) DO UPDATE')
		expect(query.values).toEqual([
			'org_1',
			'a@x.com,b@x.com',
			true,
			null,
			'boss@x.com',
			'user_9',
		])
		await saveOrgEmailSettingsDb('org_1', { email: 'boss@x.com' }, settings)
		expect(sql.queries()[1].values[5]).toBeNull()
	})
})
