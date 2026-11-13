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

	it('asks the host to open the trip page', () => {
		const { window, sent, deliver } = load()
		deliver({
			jsonrpc: '2.0',
			method: 'ui/notifications/tool-result',
			params: { structuredContent: { trip: trip() } },
		})
		window.document.querySelector('a')?.dispatchEvent(
			new window.MouseEvent('click', {
				bubbles: true,
				cancelable: true,
			}),
		)
		expect(sent.find((m) => m.method === 'ui/open-link')).toMatchObject({
			params: { url: 'https://patspretrips.ca/pretrip/7' },
		})
	})
})
