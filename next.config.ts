import type { NextConfig } from 'next'
import { securityHeaders } from './src/lib/security-headers'

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
			// Every route. Listed first: when two entries set the same header,
			// the later one wins, so /sw.js keeps its own stricter CSP below.
			{ source: '/:path*', headers: securityHeaders() },
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
