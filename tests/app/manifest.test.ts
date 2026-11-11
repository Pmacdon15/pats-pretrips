import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'

describe('manifest', () => {
	it('describes an installable standalone app', () => {
		const m = manifest()
		expect(m).toMatchObject({
			name: "Pat's PreTrips",
			short_name: 'PreTrips',
			start_url: '/pretrips',
			display: 'standalone',
		})
	})

	it('ships 192px, 512px and maskable icons', () => {
		const icons = manifest().icons ?? []
		expect(icons.map((i) => i.sizes)).toEqual(
			expect.arrayContaining(['192x192', '512x512']),
		)
		expect(icons.some((i) => i.purpose === 'maskable')).toBe(true)
	})
})
