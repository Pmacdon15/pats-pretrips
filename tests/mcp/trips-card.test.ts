// @vitest-environment node
import { JSDOM, VirtualConsole } from 'jsdom'
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

function load(setup?: (w: JSDOM['window']) => void) {
	const sent: Array<Record<string, unknown>> = []
	const targets: unknown[] = []
	const parent = {
		postMessage: (m: Record<string, unknown>, target: unknown) => {
			sent.push(m)
			targets.push(target)
		},
	}
	// Anything the card's script throws (or logs as an error) lands here.
	const errors: unknown[] = []
	const virtualConsole = new VirtualConsole()
	virtualConsole.on('jsdomError', (e) => errors.push(e))
	virtualConsole.on('error', (...args) => errors.push(args))
	const { window } = new JSDOM(TRIPS_CARD_HTML, {
		runScripts: 'dangerously',
		virtualConsole,
		beforeParse(w) {
			Object.defineProperty(w, 'parent', { value: parent })
			setup?.(w)
		},
	})
	// A message as the browser delivers it: from the window that posted it.
	const deliverFrom = (source: unknown, data: unknown, origin = '') =>
		window.dispatchEvent(
			new window.MessageEvent('message', {
				data,
				origin,
				source: source as MessageEventSource,
			}),
		)
	// From the host, which is the frame the card is embedded in.
	const deliver = (data: unknown) =>
		deliverFrom(parent, data, 'https://host.example')
	return { window, sent, targets, parent, errors, deliver, deliverFrom }
}

const toolResult = (structuredContent: unknown) => ({
	jsonrpc: '2.0',
	method: 'ui/notifications/tool-result',
	params: { structuredContent },
})

/** The card's full height, as the browser would measure it. */
const setHeight = (window: JSDOM['window'], height: number) => {
	const content = window.document.getElementById('content') as HTMLElement
	content.getBoundingClientRect = () => ({ height }) as DOMRect
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

	it('asks for its full height, and scrolls inside itself only while the frame is shorter (issue #92)', () => {
		const { window, sent, deliver } = load()
		const root = window.document.documentElement
		Object.defineProperty(window, 'innerHeight', {
			value: 600,
			configurable: true,
		})
		setHeight(window, 779.2)
		deliver(toolResult({ trips: [trip(), trip({ trip_id: 8 })], page: 1 }))
		const sizes = sent.filter(
			(m) => m.method === 'ui/notifications/size-changed',
		)
		// The full height, even while the frame is shorter.
		expect(sizes.at(-1)).toMatchObject({ params: { height: 780 } })
		expect(root.classList.contains('fit')).toBe(true)
		// The host grows the frame: the card is shown whole, not scrolled.
		Object.defineProperty(window, 'innerHeight', {
			value: 780,
			configurable: true,
		})
		window.dispatchEvent(new window.Event('resize'))
		expect(root.classList.contains('fit')).toBe(false)
		// The host's own dimensions never shrink the card.
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/host-context-changed',
			params: { containerDimensions: { height: 350 } },
		})
		expect(root.classList.contains('fit')).toBe(false)
	})

	it('asks for more when the host makes the frame a little shorter than asked', () => {
		const { window, sent, deliver } = load()
		const root = window.document.documentElement
		const frame = (height: number) => {
			Object.defineProperty(window, 'innerHeight', {
				value: height,
				configurable: true,
			})
			window.dispatchEvent(new window.Event('resize'))
		}
		const asked = () =>
			sent
				.filter((m) => m.method === 'ui/notifications/size-changed')
				.map((m) => (m.params as { height: number }).height)
		setHeight(window, 400)
		deliver(toolResult({ trip: trip() }))
		expect(asked().at(-1)).toBe(400)
		// The host keeps 24px of the frame for itself: the card asks for
		// that much more, and is shown whole once the frame grows.
		frame(376)
		expect(asked().at(-1)).toBe(424)
		frame(400)
		expect(root.classList.contains('fit')).toBe(false)
		expect(asked().at(-1)).toBe(424)
		// The gap is kept when the card grows.
		setHeight(window, 500)
		window.dispatchEvent(new window.Event('resize'))
		expect(asked().at(-1)).toBe(524)
	})

	it('never keeps asking for more from a host that does not grow the frame', () => {
		const { window, sent, deliver } = load()
		const asked = () =>
			sent.filter((m) => m.method === 'ui/notifications/size-changed')
		setHeight(window, 400)
		deliver(toolResult({ trip: trip() }))
		Object.defineProperty(window, 'innerHeight', {
			value: 380,
			configurable: true,
		})
		for (let i = 0; i < 5; i++) {
			window.dispatchEvent(new window.Event('resize'))
		}
		expect(asked().at(-1)).toMatchObject({ params: { height: 420 } })
		// A frame far shorter than the card: no extra, it scrolls instead.
		Object.defineProperty(window, 'innerHeight', {
			value: 150,
			configurable: true,
		})
		window.dispatchEvent(new window.Event('resize'))
		expect(asked().at(-1)).toMatchObject({ params: { height: 420 } })
		expect(window.document.documentElement.classList.contains('fit')).toBe(
			true,
		)
	})

	it('shows the space of an empty list and where the trips are instead (issue #92)', () => {
		const { window, deliver } = load()
		deliver(
			toolResult({
				trips: [],
				has_more: false,
				page: 1,
				when: 'current',
				space: 'personal',
				elsewhere: [
					{
						space: 'organization',
						organization_id: 'org_1',
						organization_name: 'Alpine Gasses',
						count: 1,
						has_more: false,
					},
					{ space: 'personal', count: 10, has_more: true },
					'junk',
				],
			}),
		)
		const text = window.document.body.textContent ?? ''
		expect(text).toContain(
			'No trips in the last 24 hours in your personal space.',
		)
		expect(text).toContain('1 trip in Alpine Gasses')
		expect(text).toContain('10+ trips in your personal space')
		expect(window.document.getElementById('count')?.textContent).toBe(
			'0 trips · Personal',
		)
		deliver(
			toolResult({
				trips: [trip()],
				page: 1,
				space: 'organization',
				organization_name: 'Alpine Gasses',
			}),
		)
		expect(window.document.getElementById('count')?.textContent).toBe(
			'1 trip · Alpine Gasses',
		)
		deliver(toolResult({ trips: [], page: 1, space: 'organization' }))
		expect(window.document.body.textContent).toContain(
			'No trips in the last 24 hours in Organization.',
		)
	})

	it('says its height again once the host is initialized', async () => {
		const { window, sent, deliver } = load((w) => {
			Object.assign(w, { openai: { toolOutput: { trip: trip() } } })
		})
		setHeight(window, 300)
		window.dispatchEvent(new window.Event('openai:set-globals'))
		const count = () =>
			sent.filter((m) => m.method === 'ui/notifications/size-changed')
				.length
		const before = count()
		deliver({ jsonrpc: '2.0', id: 1, result: {} })
		await flush()
		expect(count()).toBe(before + 1)
		const methods = sent.map((m) => m.method)
		expect(methods.lastIndexOf('ui/notifications/size-changed')).toBe(
			methods.indexOf('ui/notifications/initialized') + 1,
		)
		expect(sent.at(-1)).toMatchObject({ params: { height: 300 } })
	})

	it('tells ChatGPT its height with notifyIntrinsicHeight', () => {
		const heights: number[] = []
		const { window } = load((w) => {
			Object.assign(w, {
				openai: {
					toolOutput: null,
					notifyIntrinsicHeight: (h: number) => heights.push(h),
				},
			})
		})
		setHeight(window, 412)
		const openai = (
			window as unknown as { openai: Record<string, unknown> }
		).openai
		openai.toolOutput = { trip: trip() }
		window.dispatchEvent(new window.Event('openai:set-globals'))
		expect(heights.at(-1)).toBe(412)
	})

	it('keeps drawing when notifyIntrinsicHeight throws', () => {
		const { window, errors } = load((w) => {
			Object.assign(w, {
				openai: {
					toolOutput: { trip: trip() },
					notifyIntrinsicHeight: () => {
						throw new Error('nope')
					},
				},
			})
		})
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Freightliner Cascadia',
		)
		expect(errors).toEqual([])
	})

	it('scrolls an opened trip into view', () => {
		const { window, deliver } = load()
		deliver(toolResult({ trips: [trip(), trip({ trip_id: 8 })], page: 1 }))
		const card = window.document.querySelectorAll(
			'details.trip',
		)[1] as HTMLDetailsElement
		const calls: unknown[] = []
		card.scrollIntoView = ((o: unknown) => {
			calls.push(o)
		}) as typeof card.scrollIntoView
		card.open = true
		card.dispatchEvent(new window.Event('toggle'))
		expect(calls).toEqual([{ block: 'nearest' }])
		card.open = false
		card.dispatchEvent(new window.Event('toggle'))
		expect(calls).toHaveLength(1)
	})

	it('says a signed trip from the last 24 hours only takes defects', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: {
				structuredContent: {
					trips: [
						trip({ trip_id: 1, can_edit_details: true }),
						trip({ trip_id: 2, can_edit_details: false }),
						trip({
							trip_id: 3,
							can_update: false,
							can_edit_details: false,
						}),
					],
					has_more: false,
					page: 1,
					when: 'current',
				},
			},
		})
		const chips = [...window.document.querySelectorAll('.trip')].map((t) =>
			[...t.querySelectorAll('.chip')].map((c) => c.textContent),
		)
		expect(chips[0]).toContain('Editable')
		expect(chips[1]).toContain('Signed · can add defects')
		expect(chips[1]).not.toContain('Editable')
		expect(chips[2]).not.toContain('Editable')
		expect(chips[2]).not.toContain('Signed · can add defects')
	})

	it('lists several trips as short rows that open to the full card', () => {
		const { window, deliver } = load()
		deliver(
			toolResult({
				trips: [
					trip(),
					trip({ trip_id: 8, defects: ['Tires', 'Lights'] }),
				],
				has_more: false,
				page: 1,
				when: 'current',
			}),
		)
		const rows = [...window.document.querySelectorAll('details.trip')]
		expect(rows).toHaveLength(2)
		expect(rows.every((r) => !r.hasAttribute('open'))).toBe(true)
		const summaries = rows.map(
			(r) => r.querySelector('summary')?.textContent,
		)
		expect(summaries[0]).toContain('Freightliner Cascadia')
		expect(summaries[0]).toContain('No defects')
		expect(summaries[0]).toContain('ABC 1234')
		expect(summaries[0]).not.toContain('Trip #')
		expect(summaries[1]).toContain('2 defects open')
		// The details are still there, behind the tap.
		expect(rows[1].querySelector('.body')?.textContent).toContain(
			'Open in PreTrips',
		)
	})

	it('shows a single listed trip in full', () => {
		const { window, deliver } = load()
		deliver(
			toolResult({
				trips: [trip()],
				has_more: false,
				page: 1,
				when: 'current',
			}),
		)
		expect(window.document.querySelector('details')).toBeNull()
		expect(window.document.querySelectorAll('article.trip')).toHaveLength(1)
	})

	it('shows one trip from get_trip, and an empty list kindly', () => {
		const { window, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { trip: trip() } },
		})
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Freightliner Cascadia',
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

describe('trips card: who it listens to', () => {
	const shown = (window: JSDOM['window']) => ({
		heading: window.document.getElementById('heading')?.textContent,
		count: window.document.getElementById('count')?.textContent,
		list: window.document.getElementById('list')?.textContent,
	})

	it('ignores a forged tool result from a window other than its parent', () => {
		const { window, errors, deliver, deliverFrom } = load()
		deliver(toolResult({ trip: trip() }))
		const before = shown(window)
		expect(before.heading).toBe('Freightliner Cascadia')

		// A sibling frame, the top page, or the card's own window posting
		// into it: none of them is the host.
		const sibling = new JSDOM('').window
		const forged = toolResult({
			trips: [trip({ trip_id: 666, remarks: 'Brakes failed' })],
			has_more: false,
			page: 1,
			when: 'current',
		})
		deliverFrom(sibling, forged, 'https://host.example')
		deliverFrom(window, forged, 'https://host.example')
		deliverFrom(window.top, forged)
		deliverFrom(null, forged)
		deliverFrom(undefined, forged)
		expect(shown(window)).toEqual(before)
		expect(window.document.body.textContent).not.toContain('666')
		expect(window.document.body.textContent).not.toContain('Brakes failed')
		sibling.close()
		expect(errors).toEqual([])
	})

	it('ignores a forged tool result even before the host sends one', () => {
		const { window, deliverFrom } = load()
		deliverFrom(new JSDOM('').window, toolResult({ trip: trip() }))
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Loading trips…',
		)
		expect(window.document.querySelectorAll('.trip')).toHaveLength(0)
	})

	it('still draws what its parent sends, whatever the origin', () => {
		const { window, parent, deliverFrom } = load()
		// Sandboxed frames without allow-same-origin report "null".
		deliverFrom(parent, toolResult({ trip: trip() }), 'null')
		expect(window.document.querySelectorAll('.trip')).toHaveLength(1)
		deliverFrom(
			parent,
			toolResult({
				trip: trip({ trip_id: 8, make: 'Kenworth', model: 'T680' }),
			}),
			'https://other-host.example',
		)
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Kenworth T680',
		)
	})

	it('only takes the answer to its requests from its parent', async () => {
		const { window, sent, deliver, deliverFrom } = load()
		const initialized = () =>
			sent.filter((m) => m.method === 'ui/notifications/initialized')
		deliverFrom(new JSDOM('').window, {
			jsonrpc: '2.0',
			id: 1,
			result: { hostContext: { theme: 'dark' } },
		})
		await flush()
		expect(initialized()).toHaveLength(0)
		expect(window.document.documentElement.dataset.theme).toBeUndefined()

		deliver({
			jsonrpc: '2.0',
			id: 1,
			result: { hostContext: { theme: 'light' } },
		})
		await flush()
		expect(initialized()).toHaveLength(1)
		expect(window.document.documentElement.dataset.theme).toBe('light')

		// The request is answered: a second answer changes nothing.
		deliver({
			jsonrpc: '2.0',
			id: 1,
			result: { hostContext: { theme: 'dark' } },
		})
		await flush()
		expect(initialized()).toHaveLength(1)
		expect(window.document.documentElement.dataset.theme).toBe('light')
	})

	it('ignores theme changes from other windows', () => {
		const { window, deliver, deliverFrom } = load()
		const change = (theme: unknown) => ({
			jsonrpc: '2.0',
			method: 'ui/notifications/host-context-changed',
			params: { theme },
		})
		deliverFrom(new JSDOM('').window, change('dark'))
		expect(window.document.documentElement.dataset.theme).toBeUndefined()
		deliver(change('dark'))
		expect(window.document.documentElement.dataset.theme).toBe('dark')
		deliver(change('purple'))
		expect(window.document.documentElement.dataset.theme).toBe('dark')
	})

	it('does not answer requests from other windows', () => {
		const { sent, deliver, deliverFrom } = load()
		const ping = { jsonrpc: '2.0', id: 'p1', method: 'ping' }
		deliverFrom(new JSDOM('').window, ping)
		expect(sent.some((m) => m.id === 'p1')).toBe(false)
		deliver(ping)
		expect(sent.filter((m) => m.id === 'p1')).toEqual([
			{ jsonrpc: '2.0', id: 'p1', result: {} },
		])
	})
})

describe('trips card: odd messages', () => {
	it('shrugs off messages that are not JSON-RPC', () => {
		const { window, sent, errors, deliver } = load()
		const before = sent.length
		for (const data of [
			null,
			undefined,
			0,
			42,
			'',
			'{"jsonrpc":"2.0"}',
			true,
			[],
			['2.0'],
			{},
			{ jsonrpc: '1.0', method: 'ui/notifications/tool-result' },
			{ jsonrpc: 2, method: 'ui/notifications/tool-result' },
		]) {
			deliver(data)
		}
		expect(sent.length).toBe(before)
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Loading trips…',
		)
		expect(errors).toEqual([])
	})

	it('shrugs off tool results with missing or odd params', () => {
		const { window, errors, deliver } = load()
		for (const params of [undefined, null, 'x', 7, [], {}]) {
			deliver({
				jsonrpc: '2.0',
				method: 'ui/notifications/tool-result',
				params,
			})
		}
		for (const content of [
			undefined,
			null,
			'trips',
			3,
			[],
			[trip()],
			{},
			{ trips: 'many' },
			{ trips: { 0: trip() } },
			{ trip: 'seven' },
			{ trip: 7 },
			{ trip: null },
		]) {
			deliver(toolResult(content))
		}
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Loading trips…',
		)
		expect(window.document.querySelectorAll('.trip')).toHaveLength(0)
		expect(errors).toEqual([])
	})

	it('skips entries that are not trips or defects', () => {
		const { window, errors, deliver } = load()
		deliver(
			toolResult({
				trips: [null, 5, 'x', [], trip({ trip_id: 3 })],
				has_more: false,
				page: 1,
				when: 'current',
			}),
		)
		expect(window.document.querySelectorAll('.trip')).toHaveLength(1)
		expect(window.document.getElementById('count')?.textContent).toBe(
			'1 trip',
		)
		deliver(
			toolResult({
				trips: [null, 'x'],
				has_more: false,
				page: 1,
				when: 'current',
			}),
		)
		expect(window.document.body.textContent).toContain(
			'No trips in the last 24 hours.',
		)
		deliver(toolResult({ open: [null, 1], repaired: ['x'] }))
		expect(window.document.querySelectorAll('.trip')).toHaveLength(0)
		expect(window.document.body.textContent).toContain('No open defects.')
		deliver(toolResult({ repaired: [] }))
		expect(window.document.body.textContent).toContain('No repairs yet.')
		deliver(
			toolResult({
				trip: trip({
					defects: ['Tires'],
					defect_status: 'nope',
				}),
				defect_status: [
					null,
					4,
					{ defect: 'Tires', status: 'repaired' },
				],
			}),
		)
		expect(window.document.querySelector('.chip.bad')?.textContent).toBe(
			'Tires · Open',
		)
		expect(errors).toEqual([])
	})

	it('replaces the card whole, or says it could not, when data breaks it', () => {
		const { window, sent, errors, deliver } = load()
		deliver(toolResult({ trip: trip() }))
		expect(window.document.querySelectorAll('.trip')).toHaveLength(1)
		// A defect that cannot be turned into text throws while drawing.
		deliver(
			toolResult({
				trips: [
					trip({ trip_id: 1 }),
					trip({ defects: [{ toString: 'x' }] }),
				],
				has_more: false,
				page: 1,
				when: 'current',
			}),
		)
		const doc = window.document
		expect(doc.querySelectorAll('.trip')).toHaveLength(0)
		expect(doc.getElementById('list')?.textContent).toBe(
			'Could not show this result.',
		)
		expect(doc.getElementById('heading')?.textContent).toBe(
			"Pat's PreTrips",
		)
		expect(doc.getElementById('count')?.textContent).toBe('')
		expect(sent.at(-1)?.method).toBe('ui/notifications/size-changed')
		expect(errors).toEqual([])

		// The next good result draws as usual.
		deliver(
			toolResult({
				trip: trip({ trip_id: 9, make: 'Peterbilt', model: '579' }),
			}),
		)
		expect(doc.getElementById('heading')?.textContent).toBe('Peterbilt 579')
		expect(doc.querySelectorAll('.trip')).toHaveLength(1)
	})

	it('ignores answers to requests it never sent', async () => {
		const { window, sent, errors, deliver } = load()
		const before = sent.length
		for (const id of [
			99,
			'1',
			'__proto__',
			'constructor',
			'toString',
			null,
		]) {
			deliver({ jsonrpc: '2.0', id, result: {} })
			deliver({ jsonrpc: '2.0', id, error: { code: -1, message: 'x' } })
		}
		deliver({ jsonrpc: '2.0', result: {} })
		deliver({ jsonrpc: '2.0', id: { n: 1 }, result: {} })
		await flush()
		// No replies to responses, and ui/initialize (id 1) still waits.
		expect(sent.length).toBe(before)
		expect(
			sent.some((m) => m.method === 'ui/notifications/initialized'),
		).toBe(false)
		expect(window.document.documentElement.dataset.theme).toBeUndefined()
		expect(errors).toEqual([])
	})

	it('does not mistake a host request for the answer to its own', async () => {
		const { sent, deliver } = load()
		deliver({ jsonrpc: '2.0', id: 1, method: 'ping' })
		await flush()
		expect(sent.filter((m) => m.id === 1 && 'result' in m)).toEqual([
			{ jsonrpc: '2.0', id: 1, result: {} },
		])
		expect(
			sent.some((m) => m.method === 'ui/notifications/initialized'),
		).toBe(false)
		deliver({ jsonrpc: '2.0', id: 1, result: {} })
		await flush()
		expect(
			sent.some((m) => m.method === 'ui/notifications/initialized'),
		).toBe(true)
	})

	it('initializes even when the host answers oddly', async () => {
		for (const answer of [
			{ result: null },
			{ result: 'ok' },
			{ result: { hostContext: 'dark' } },
			{ error: { code: -32601, message: 'Method not found' } },
		]) {
			const { window, sent, errors, deliver } = load()
			deliver({ jsonrpc: '2.0', id: 1, ...answer })
			await flush()
			expect(
				sent.some((m) => m.method === 'ui/notifications/initialized'),
			).toBe(true)
			expect(
				window.document.documentElement.dataset.theme,
			).toBeUndefined()
			expect(errors).toEqual([])
		}
	})

	it('does not answer notifications or requests with odd ids', () => {
		const { sent, errors, deliver } = load()
		const before = sent.length
		deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-input' })
		deliver({ jsonrpc: '2.0', method: 'ping', id: null })
		deliver({ jsonrpc: '2.0', method: 'ping', id: { n: 1 } })
		deliver({ jsonrpc: '2.0', method: 7, id: 5 })
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/host-context-changed',
		})
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/host-context-changed',
			params: 'dark',
		})
		expect(sent.length).toBe(before)
		expect(errors).toEqual([])
	})
})

describe('trips card: links', () => {
	const repairWith = (urls: Record<string, unknown>) =>
		toolResult({
			trip: trip({ defects: ['Tires'] }),
			defect_status: [
				{
					defect: 'Tires',
					status: 'repaired',
					repair: {
						repaired_on: '2026-11-12',
						shop_name: 'Northside Truck',
						signed: true,
						...urls,
					},
				},
			],
		})

	const unsafe = [
		'javascript:alert(1)',
		'JAVASCRIPT:alert(1)',
		' javascript:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'vbscript:msgbox(1)',
		'http://patspretrips.ca/api/repairs/3/invoice',
		'https://evil.example/invoice',
		'https://patspretrips.ca',
		'https://patspretrips.ca.evil.example/x',
		'https://patspretrips.ca@evil.example/x',
		'https://patspretrips.ca:8443/x',
		'//patspretrips.ca/x',
		'/api/repairs/3/invoice',
		' https://patspretrips.ca/x',
		7,
		{ href: 'https://patspretrips.ca/x' },
	]

	it.each(unsafe)('does not link to %s', (url) => {
		const { window, errors, deliver } = load()
		const opened: unknown[] = []
		window.open = ((...args: unknown[]) => {
			opened.push(args)
			return {} as Window
		}) as typeof window.open
		deliver(repairWith({ invoice_url: url, signature_url: url }))
		const anchors = [...window.document.querySelectorAll('a')]
		expect(anchors.map((a) => a.textContent)).toEqual([
			'Open in PreTrips →',
		])
		expect(
			window.document.getElementById('list')?.textContent,
		).not.toContain('Invoice →')
		expect(
			window.document.getElementById('list')?.textContent,
		).not.toContain('Signature →')
		expect(errors).toEqual([])
	})

	it('links to files on the site itself', () => {
		const { window, deliver } = load()
		deliver(
			repairWith({
				invoice_url: 'https://patspretrips.ca/api/repairs/3/invoice',
				signature_url:
					'https://patspretrips.ca/api/repairs/3/signature',
			}),
		)
		const hrefs = [...window.document.querySelectorAll('a')].map((a) =>
			a.getAttribute('href'),
		)
		expect(hrefs).toEqual([
			'https://patspretrips.ca/api/repairs/3/invoice',
			'https://patspretrips.ca/api/repairs/3/signature',
			'https://patspretrips.ca/pretrip/7',
		])
	})

	it('keeps trip links on the site whatever the trip id is', () => {
		const { window, deliver } = load()
		deliver(
			toolResult({
				trips: [
					trip({ trip_id: 'javascript:alert(1)' }),
					trip({ trip_id: '../../evil' }),
					trip({ trip_id: '//evil.example' }),
				],
				has_more: false,
				page: 1,
				when: 'current',
			}),
		)
		const anchors = [...window.document.querySelectorAll('a')]
		expect(anchors).toHaveLength(3)
		for (const a of anchors) {
			expect(
				a
					.getAttribute('href')
					?.startsWith('https://patspretrips.ca/pretrip/'),
			).toBe(true)
			expect(a.protocol).toBe('https:')
			expect(a.host).toBe('patspretrips.ca')
		}
	})
})

describe('trips card: what it sends', () => {
	it('sends only its own protocol messages, to its parent', async () => {
		const { window, sent, targets, deliver } = load()
		window.open = (() => null) as typeof window.open
		deliver({ jsonrpc: '2.0', id: 1, result: {} })
		await flush()
		deliver(toolResult({ trip: trip({ remarks: 'secret remark' }) }))
		deliver({ jsonrpc: '2.0', id: 'h1', method: 'ui/resource-teardown' })
		window.document.querySelector('a')?.dispatchEvent(
			new window.MouseEvent('click', {
				bubbles: true,
				cancelable: true,
			}),
		)
		const shapes = sent.map((m) => {
			const { jsonrpc, id, method, result } = m as Record<string, unknown>
			expect(jsonrpc).toBe('2.0')
			return method ?? `result:${String(id)}:${JSON.stringify(result)}`
		})
		expect(new Set(shapes)).toEqual(
			new Set([
				'ui/initialize',
				'ui/notifications/initialized',
				'ui/notifications/size-changed',
				'result:h1:{}',
				'ui/open-link',
			]),
		)
		expect(sent.find((m) => m.method === 'ui/initialize')?.params).toEqual({
			protocolVersion: '2026-01-26',
			appInfo: { name: 'pats-pretrips-trips-card', version: '1.0.0' },
			appCapabilities: {},
		})
		for (const m of sent.filter(
			(m) => m.method === 'ui/notifications/size-changed',
		)) {
			expect(Object.keys(m.params as object)).toEqual(['height'])
		}
		expect(sent.find((m) => m.method === 'ui/open-link')?.params).toEqual({
			url: 'https://patspretrips.ca/pretrip/7',
		})
		expect(JSON.stringify(sent)).not.toContain('secret remark')
		// The host's origin is not known in advance, so '*' it is; only the
		// parent ever gets these.
		expect(new Set(targets)).toEqual(new Set(['*']))
	})
})

describe('trips card in ChatGPT', () => {
	it('draws the tool output ChatGPT puts on window.openai', () => {
		const { window, errors } = load((w) => {
			Object.assign(w, { openai: { toolOutput: { trip: trip() } } })
		})
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Freightliner Cascadia',
		)
		expect(errors).toEqual([])
	})

	it('redraws when ChatGPT updates its globals', () => {
		const { window, errors } = load((w) => {
			Object.assign(w, { openai: { toolOutput: null } })
		})
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Loading trips…',
		)
		const openai = (
			window as unknown as { openai: Record<string, unknown> }
		).openai
		openai.toolOutput = {
			trip: trip({ trip_id: 12, make: 'Mack', model: 'Anthem' }),
		}
		window.dispatchEvent(new window.Event('openai:set-globals'))
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Mack Anthem',
		)
		openai.toolOutput = { trips: [trip({ defects: [{ toString: 'x' }] })] }
		window.dispatchEvent(new window.Event('openai:set-globals'))
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Could not show this result.',
		)
		openai.toolOutput = 'odd'
		window.dispatchEvent(new window.Event('openai:set-globals'))
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Could not show this result.',
		)
		expect(errors).toEqual([])
	})

	it('ignores the globals event when window.openai is not there', () => {
		const { window, errors } = load()
		window.dispatchEvent(new window.Event('openai:set-globals'))
		expect(window.document.getElementById('list')?.textContent).toBe(
			'Loading trips…',
		)
		expect(errors).toEqual([])
	})
})

describe('trips card: vehicles', () => {
	const vehicle = (over = {}) => ({
		vehicle_id: 3,
		name: 'Unit 42',
		make: 'Volvo',
		model: 'VNL',
		truck_plate: 'TRK1',
		trailer_plate_a: 'A1',
		trailer_plate_b: 'B1',
		...over,
	})

	it('draws the saved vehicles', () => {
		const { window, deliver, errors } = load()
		deliver(
			toolResult({
				vehicles: [
					vehicle(),
					vehicle({
						vehicle_id: 4,
						name: null,
						truck_plate: null,
						trailer_plate_a: null,
						trailer_plate_b: null,
					}),
				],
			}),
		)
		const text = window.document.body.textContent ?? ''
		expect(window.document.querySelectorAll('.trip')).toHaveLength(2)
		expect(text).toContain('Saved vehicles')
		expect(text).toContain('2 vehicles')
		expect(text).toContain('Unit 42')
		expect(text).toContain('Truck Volvo VNL')
		expect(text).toContain('Plate TRK1')
		expect(text).toContain('Trailer A A1')
		expect(text).toContain('Trailer B B1')
		expect(text).toContain('Vehicle #4')
		const link = window.document.querySelector('a')
		expect(link?.getAttribute('href')).toBe(
			'https://patspretrips.ca/vehicles',
		)
		expect(errors).toEqual([])
	})

	it('draws one vehicle, saved or deleted', () => {
		const { window, deliver } = load()
		deliver(toolResult({ vehicle: vehicle() }))
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Vehicle #3',
		)
		expect(window.document.getElementById('count')?.textContent).toBe('')
		deliver(
			toolResult({
				status: 'deleted',
				vehicle: vehicle({ name: null, make: null, model: null }),
			}),
		)
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Vehicle deleted',
		)
		expect(window.document.querySelector('.title')?.textContent).toBe(
			'Vehicle 3',
		)
	})

	it('says when there are none', () => {
		const { window, deliver } = load()
		deliver(toolResult({ vehicles: [vehicle()] }))
		deliver(toolResult({ vehicles: [] }))
		const text = window.document.body.textContent ?? ''
		expect(text).toContain('0 vehicles')
		expect(text).toContain('No saved vehicles yet.')
	})

	it('draws the trip of a started trip, not its vehicle', () => {
		const { window, deliver } = load()
		deliver(
			toolResult({ trip: trip({ trip_id: 12 }), vehicles: [vehicle()] }),
		)
		expect(window.document.getElementById('heading')?.textContent).toBe(
			'Freightliner Cascadia',
		)
	})
})
