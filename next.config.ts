import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	typedRoutes: true,
	cacheComponents: true,
	reactCompiler: true,
	experimental: {
		// Repair invoices are uploaded through a server action. Photos are
		// shrunk in the browser first; this leaves room for a PDF.
		serverActions: { bodySizeLimit: '5mb' },
	},
	async headers() {
		return [
			{
				source: '/sw.js',
				headers: [
					{
						key: 'Content-Type',
						value: 'application/javascript; charset=utf-8',
					},
					{
						key: 'Cache-Control',
						value: 'no-cache, no-store, must-revalidate',
					},
					{
						key: 'Content-Security-Policy',
						value: "default-src 'self'; script-src 'self'",
					},
				],
			},
		]
	},
}

export default nextConfig
