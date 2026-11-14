import type { NextConfig } from 'next'
import { fileRouteHeaders, securityHeaders } from './src/lib/security-headers'

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
			// the later one wins, so /sw.js and the stored-file routes keep their
			// own stricter CSP below. A route handler can't override these: on
			// Next 16.4 a header set here replaces the handler's own.
			{ source: '/:path*', headers: securityHeaders() },
			...fileRouteHeaders(),
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
