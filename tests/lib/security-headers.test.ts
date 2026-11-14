import { describe, expect, it } from 'vitest'
import {
	clerkOrigins,
	ENFORCED_CSP,
	FALLBACK_CLERK_ORIGINS,
	reportOnlyCsp,
	securityHeaders,
} from '@/lib/security-headers'

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
