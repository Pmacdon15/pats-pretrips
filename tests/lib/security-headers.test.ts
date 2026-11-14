import { describe, expect, it } from 'vitest'
import {
	clerkOrigins,
	ENFORCED_CSP,
	FALLBACK_CLERK_ORIGINS,
	FILE_CSP,
	FILE_ROUTES,
	fileRouteHeaders,
	reportOnlyCsp,
	securityHeaders,
} from '@/lib/security-headers'
import nextConfig from '../../next.config'

// `pk_live_` + base64("clerk.patspretrips.ca$")
const LIVE_KEY = 'pk_live_Y2xlcmsucGF0c3ByZXRyaXBzLmNhJA'

function directives(policy: string) {
	return new Map(
		policy.split('; ').map((part) => {
			const [name, ...values] = part.split(' ')
			return [name, values] as const
		}),
	)
}

function header(headers: { key: string; value: string }[], key: string) {
	return headers.find((h) => h.key === key)?.value
}

describe('clerkOrigins', () => {
	it('uses the Frontend API from the publishable key', () => {
		expect(clerkOrigins(LIVE_KEY)).toEqual([
			'https://clerk.patspretrips.ca',
		])
	})

	it('falls back to production and dev instance hosts', () => {
		expect(clerkOrigins(undefined)).toBe(FALLBACK_CLERK_ORIGINS)
		expect(clerkOrigins('not-a-key')).toEqual([
			'https://clerk.patspretrips.ca',
			'https://*.clerk.accounts.dev',
		])
	})
})

describe('reportOnlyCsp', () => {
	it('allows Clerk, Turnstile, signatures and the app itself in production', () => {
		const csp = directives(
			reportOnlyCsp({ clerk: ['https://clerk.example.com'], dev: false }),
		)
		expect(csp.get('default-src')).toEqual(["'self'"])
		expect(csp.get('script-src')).toEqual([
			"'self'",
			"'unsafe-inline'",
			'https://clerk.example.com',
			'https://challenges.cloudflare.com',
			'https://*.protect.clerk.com',
		])
		expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"])
		expect(csp.get('img-src')).toEqual([
			"'self'",
			'data:',
			'blob:',
			'https://img.clerk.com',
		])
		expect(csp.get('connect-src')).toContain('https://clerk.example.com')
		expect(csp.get('connect-src')).not.toContain(
			'https://va.vercel-scripts.com',
		)
		expect(csp.get('frame-src')).toContain(
			'https://challenges.cloudflare.com',
		)
		expect(csp.get('worker-src')).toEqual(["'self'", 'blob:'])
		expect(csp.get('font-src')).toEqual(["'self'", 'data:'])
		expect(csp.get('manifest-src')).toEqual(["'self'"])
		expect(csp.get('frame-ancestors')).toEqual(["'self'"])
		expect(csp.get('object-src')).toEqual(["'none'"])
	})

	it("adds 'unsafe-eval' and the analytics debug script in development", () => {
		const csp = directives(reportOnlyCsp({ clerk: [], dev: true }))
		expect(csp.get('script-src')).toContain("'unsafe-eval'")
		expect(csp.get('script-src')).toContain('https://va.vercel-scripts.com')
		expect(csp.get('connect-src')).toContain(
			'https://va.vercel-scripts.com',
		)
	})
})

describe('securityHeaders', () => {
	it('sends the low-risk headers enforced', () => {
		const headers = securityHeaders({ NODE_ENV: 'production' })
		expect(header(headers, 'X-Content-Type-Options')).toBe('nosniff')
		expect(header(headers, 'Referrer-Policy')).toBe(
			'strict-origin-when-cross-origin',
		)
		expect(header(headers, 'X-Frame-Options')).toBe('SAMEORIGIN')
		expect(header(headers, 'Strict-Transport-Security')).toBe(
			'max-age=63072000; includeSubDomains',
		)
		expect(header(headers, 'Content-Security-Policy')).toBe(ENFORCED_CSP)
	})

	it('only enforces CSP directives that cannot block scripts or styles', () => {
		const enforced = directives(ENFORCED_CSP)
		expect([...enforced.keys()]).toEqual([
			'frame-ancestors',
			'base-uri',
			'object-src',
		])
	})

	it('keeps geolocation for the trip form and turns off the camera', () => {
		const policy = header(
			securityHeaders({ NODE_ENV: 'production' }),
			'Permissions-Policy',
		)
		expect(policy).toContain('geolocation=(self)')
		expect(policy).toContain('camera=()')
		expect(policy).toContain('microphone=()')
	})

	it('builds the report-only policy from the environment', () => {
		const prod = header(
			securityHeaders({
				NODE_ENV: 'production',
				NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: LIVE_KEY,
			}),
			'Content-Security-Policy-Report-Only',
		)
		expect(prod).toContain('https://clerk.patspretrips.ca')
		expect(prod).not.toContain("'unsafe-eval'")

		const dev = header(
			securityHeaders({ NODE_ENV: 'development' }),
			'Content-Security-Policy-Report-Only',
		)
		expect(dev).toContain("'unsafe-eval'")
		expect(dev).toContain('https://*.clerk.accounts.dev')
	})

	it('reads process.env by default', () => {
		expect(header(securityHeaders(), 'X-Frame-Options')).toBe('SAMEORIGIN')
	})
})

describe('stored file routes', () => {
	it('lets a file load or run nothing, in an opaque origin', () => {
		const csp = directives(FILE_CSP)
		expect(Object.fromEntries(csp)).toEqual({
			'default-src': ["'none'"],
			'img-src': ["'self'"],
			'style-src': ["'unsafe-inline'"],
			sandbox: [],
			'frame-ancestors': ["'self'"],
		})
	})

	it('gives every file route FILE_CSP', () => {
		expect(fileRouteHeaders()).toEqual(
			FILE_ROUTES.map((source) => ({
				source,
				headers: [{ key: 'Content-Security-Policy', value: FILE_CSP }],
			})),
		)
		expect(FILE_ROUTES).toEqual([
			'/api/repairs/:repairId/:kind',
			'/api/signature',
			'/api/trips/:tripId/signature',
		])
	})

	it('lists the file routes after the site-wide headers in next.config', async () => {
		const entries = (await nextConfig.headers?.()) ?? []
		const sources = entries.map((e) => e.source)
		const all = sources.indexOf('/:path*')
		expect(all).toBe(0)
		for (const route of FILE_ROUTES) {
			const index = sources.indexOf(route)
			expect(index).toBeGreaterThan(all)
			expect(
				header(entries[index].headers, 'Content-Security-Policy'),
			).toBe(FILE_CSP)
		}
	})
})
