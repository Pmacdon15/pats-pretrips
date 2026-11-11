import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
	return {
		id: '/',
		name: "Pat's PreTrips",
		short_name: 'PreTrips',
		description:
			'Record pre-trip inspections, flag defects and keep a history of every trip.',
		start_url: '/pretrips',
		scope: '/',
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#0b1020',
		theme_color: '#059669',
		categories: ['productivity', 'business', 'utilities'],
		icons: [
			{
				src: '/icons/icon-192.png',
				sizes: '192x192',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/icon-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'any',
			},
			{
				src: '/icons/icon-maskable-512.png',
				sizes: '512x512',
				type: 'image/png',
				purpose: 'maskable',
			},
		],
		shortcuts: [
			{
				name: 'My Trips',
				short_name: 'Trips',
				url: '/pretrips',
				icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
			},
		],
	}
}
