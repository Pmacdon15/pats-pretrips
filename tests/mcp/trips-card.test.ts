// @vitest-environment node
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { TRIPS_CARD_HTML } from '@/mcp/trips-card'

/*
 * The trips card run the way an MCP Apps host runs it: loaded in a frame,
 * it asks the host to initialize, then draws the tool result it is sent.
 */

const trip = (over: Record<string, unknown> = {}) => ({
	trip_id: 7,
	date: '2026-11-12T14:00:00.000Z',
	carrier: 'Acme Freight',
	inspection_address: '455 Yard Ave',
	make: 'Freightliner',
	model: 'Cascadia',
	odometer: 482317,
	truck_plate: 'ABC 1234',
	trailer_plate_a: null,
	trailer_plate_b: null,
	defects: [],
	remarks: 'No defects found',
	can_update: true,
	...over,
})

function load() {
	const sent: Array<Record<string, unknown>> = []
	const { window } = new JSDOM(TRIPS_CARD_HTML, {
		runScripts: 'dangerously',
		beforeParse(w) {
			Object.defineProperty(w, 'parent', {
				value: {
					postMessage: (m: Record<string, unknown>) => sent.push(m),
				},
			})
		},
	})
	const deliver = (data: unknown) =>
		window.dispatchEvent(new window.MessageEvent('message', { data }))
	return { window, sent, deliver }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('trips card', () => {
	it('initializes with the host, then draws the trips it is sent', async () => {
		const { window, sent, deliver } = load()
		const init = sent.find((m) => m.method === 'ui/initialize')
		expect(init).toMatchObject({ jsonrpc: '2.0', id: 1 })

		deliver({
			jsonrpc: '2.0',
			id: 1,
			result: { hostContext: { theme: 'dark' } },
		})
		await flush()
		expect(
			sent.some((m) => m.method === 'ui/notifications/initialized'),
		).toBe(true)
		expect(window.document.documentElement.dataset.theme).toBe('dark')

		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					trips: [
						trip(),
						trip({
							trip_id: 8,
							defects: ['Tires', 'Lights'],
							can_update: false,
						}),
					],
					has_more: true,
					page: 1,
					when: 'current',
				},
			},
		})
		const text = window.document.body.textContent ?? ''
		expect(window.document.querySelectorAll('.trip')).toHaveLength(2)
		expect(text).toContain('Current trips')
		expect(text).toContain('2 trips · page 1, more available')
		expect(text).toContain('Freightliner Cascadia')
		expect(text).toContain('ABC 1234')
		expect(text).toContain('No defects')
		expect(text).toContain('Tires')
		expect(window.document.querySelectorAll('.chip.bad')).toHaveLength(2)
	})

	it('shows one trip from get_trip, and an empty list kindly', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { trip: trip() } },
		})
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Trip #7',
		)
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					trips: [],
					has_more: false,
					page: 1,
					when: 'past',
				},
			},
		})
		expect(window.document.body.textContent).toContain('No older trips.')
	})

	it('never treats remarks as HTML', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					trip: trip({ remarks: '<img src=x onerror=alert(1)>' }),
				},
			},
		})
		expect(window.document.querySelector('img')).toBeNull()
		expect(window.document.querySelector('.remarks')?.textContent).toBe(
			'<img src=x onerror=alert(1)>',
		)
	})

	const clickLink = (window: JSDOM['window']) =>
		window.document.querySelector('a')?.dispatchEvent(
			new window.MouseEvent('click', {
				bubbles: true,
				cancelable: true,
			}),
		)

	it('opens the trip page in a new window right in the click', () => {
		const { window, sent, deliver } = load()
		const opened: unknown[][] = []
		window.open = ((...args: unknown[]) => {
			opened.push(args)
			return {} as Window
		}) as typeof window.open
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { trip: trip() } },
		})
		const link = window.document.querySelector('a')
		expect(link?.getAttribute('target')).toBe('_blank')
		clickLink(window)
		expect(opened).toEqual([
			['https://patspretrips.ca/pretrip/7', '_blank'],
		])
		expect(sent.some((m) => m.method === 'ui/open-link')).toBe(false)
	})

	it('asks the host to open the trip page when the frame cannot', () => {
		const { window, sent, deliver } = load()
		window.open = (() => null) as typeof window.open
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { trip: trip() } },
		})
		clickLink(window)
		expect(sent.find((m) => m.method === 'ui/open-link')).toMatchObject({
			params: { url: 'https://patspretrips.ca/pretrip/7' },
		})
	})

	it("uses ChatGPT's openExternal when it is there", () => {
		const { window, sent, deliver } = load()
		const hrefs: string[] = []
		Object.assign(window, {
			openai: {
				openExternal: (o: { href: string }) => hrefs.push(o.href),
			},
		})
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { trip: trip() } },
		})
		clickLink(window)
		expect(hrefs).toEqual(['https://patspretrips.ca/pretrip/7'])
		expect(sent.some((m) => m.method === 'ui/open-link')).toBe(false)
	})

	const repair = (over: Record<string, unknown> = {}) => ({
		repair_id: 3,
		trip_id: 7,
		defect: 'Tires',
		repaired_on: '2026-11-12',
		mechanic_name: 'Sam Lee',
		shop_name: 'Northside Truck',
		invoice_number: 'INV-88',
		notes: null,
		signed: true,
		signature_url: 'https://patspretrips.ca/api/repairs/3/signature',
		invoice_url: 'https://patspretrips.ca/api/repairs/3/invoice',
		invoice_size_bytes: 1200,
		recorded_by: 'web',
		...over,
	})

	it('shows which defects on a trip are repaired, by whom and when', () => {
		const { window, deliver } = load()
		const opened: unknown[][] = []
		window.open = ((...args: unknown[]) => {
			opened.push(args)
			return {} as Window
		}) as typeof window.open
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					trip: trip({ defects: ['Tires', 'Lights'] }),
					defect_status: [
						{
							defect: 'Tires',
							status: 'repaired',
							repair: repair(),
						},
						{ defect: 'Lights', status: 'open', repair: null },
					],
				},
			},
		})
		const doc = window.document
		expect(doc.querySelector('.chip.ok')?.textContent).toBe(
			'Tires · Repaired',
		)
		expect(doc.querySelector('.chip.bad')?.textContent).toBe(
			'Lights · Open',
		)
		const row = doc.querySelector('.repair')?.textContent ?? ''
		expect(row).toContain('Nov 12, 2026 by Sam Lee, Northside Truck')
		expect(row).toContain('Invoice INV-88')
		expect(row).toContain('Signed')
		const invoice = [...doc.querySelectorAll('a')].find(
			(a) => a.textContent === 'Invoice →',
		)
		invoice?.dispatchEvent(
			new window.MouseEvent('click', { bubbles: true, cancelable: true }),
		)
		expect(opened).toEqual([
			['https://patspretrips.ca/api/repairs/3/invoice', '_blank'],
		])
	})

	it('shows repairs on listed trips too', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					trips: [
						trip({
							defects: ['Tires'],
							defect_status: [
								{
									defect: 'Tires',
									status: 'repaired',
									repair: repair({ mechanic_name: null }),
								},
							],
						}),
					],
					has_more: false,
					page: 1,
					when: 'current',
				},
			},
		})
		expect(window.document.querySelector('.repair')?.textContent).toContain(
			'by Northside Truck',
		)
	})

	it('draws list_defects as open and repaired defects', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					open: [
						{
							trip_id: 9,
							trip_date: '2026-11-11T14:00:00.000Z',
							truck_plate: 'XYZ 9',
							make: 'Volvo',
							model: 'VNL',
							defect: 'Lights',
						},
					],
					open_count: 1,
					repaired: [
						{
							...repair({ invoice_url: null, signed: false }),
							trip_date: '2026-11-10T14:00:00.000Z',
							truck_plate: 'ABC 1234',
						},
					],
					repaired_count: 1,
				},
			},
		})
		const doc = window.document
		expect(doc.getElementById('heading')?.textContent).toBe(
			'Defects & repairs',
		)
		expect(doc.getElementById('count')?.textContent).toBe(
			'1 open · 1 repaired',
		)
		expect(doc.querySelectorAll('.trip')).toHaveLength(2)
		const text = doc.body.textContent ?? ''
		expect(text).toContain('XYZ 9')
		expect(text).toContain('Not signed')
		expect(
			[...doc.querySelectorAll('a')].some(
				(a) => a.textContent === 'Invoice →',
			),
		).toBe(false)
	})

	it('says so when there are no open defects', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { open: [], open_count: 0 } },
		})
		expect(window.document.body.textContent).toContain('No open defects.')
	})
})
