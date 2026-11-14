/*
 * Security headers sent with every response (wired up in next.config.ts).
 *
 * The enforced headers can't break script or style loading. The full
 * Content-Security-Policy is sent as Report-Only until browser reports from
 * the live site show it allows everything the app and Clerk really load.
 *
 * Imported by next.config.ts, so it uses relative imports only.
 */
import { frontendApiFromPublishableKey } from '../mcp/oauth-config'

export type Header = { key: string; value: string }

/** Used when the publishable key can't be decoded: production plus dev instances. */
export const FALLBACK_CLERK_ORIGINS = [
	'https://clerk.patspretrips.ca',
	'https://*.clerk.accounts.dev',
]

/** The Clerk Frontend API origin(s) clerk-js and its API calls come from. */
export function clerkOrigins(publishableKey: string | undefined) {
	const host = frontendApiFromPublishableKey(publishableKey)
	return host ? [`https://${host}`] : FALLBACK_CLERK_ORIGINS
}

/**
 * Enforced CSP: only directives that can't stop scripts, styles or requests.
 * `frame-ancestors` blocks clickjacking, the others close injection tricks.
 */
export const ENFORCED_CSP =
	"frame-ancestors 'self'; base-uri 'self'; object-src 'none'"

/**
 * CSP for the routes that serve stored invoices and signatures: the file
 * can't load or run anything, and `sandbox` gives it an opaque origin. Each
 * directive was checked in Chromium. `style-src 'unsafe-inline'` lets the
 * browser's own image page centre the image; `img-src 'self'` is for image
 * pages that load the image as a subresource.
 */
export const FILE_CSP =
	"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'"

/** The routes that serve stored files (see src/lib/file-response.ts). */
export const FILE_ROUTES = [
	'/api/repairs/:repairId/:kind',
	'/api/signature',
	'/api/trips/:tripId/signature',
]

/**
 * next.config.ts `headers()` entries giving the file routes FILE_CSP. Needed
 * there, not only in the route: on Next 16.4 a header set in `headers()`
 * replaces the same header from a route handler's Response, so the site-wide
 * policy would otherwise win. List these after the site-wide entry.
 */
export function fileRouteHeaders() {
	return FILE_ROUTES.map((source) => ({
		source,
		headers: [{ key: 'Content-Security-Policy', value: FILE_CSP }],
	}))
}

/** Clerk's bot protection (Cloudflare Turnstile) and its own protect service. */
const TURNSTILE = 'https://challenges.cloudflare.com'
const CLERK_PROTECT = 'https://*.protect.clerk.com'
const CLERK_IMAGES = 'https://img.clerk.com'

/**
 * The full policy, sent Report-Only. Hosts follow Clerk's own defaults
 * (@clerk/nextjs `createContentSecurityPolicyHeaders`), minus Stripe and
 * Google Maps, which this app doesn't use.
 *
 * `script-src` keeps 'unsafe-inline': Next.js inlines hydration scripts and
 * a nonce would make every page render dynamically, losing the static shell.
 */
export function reportOnlyCsp({
	clerk,
	dev,
}: {
	clerk: string[]
	dev: boolean
}) {
	const directives: Record<string, string[]> = {
		'default-src': ["'self'"],
		'script-src': [
			"'self'",
			"'unsafe-inline'",
			// React and Next.js dev tooling evaluate code; production doesn't.
			...(dev ? ["'unsafe-eval'", 'https://va.vercel-scripts.com'] : []),
			...clerk,
			TURNSTILE,
			CLERK_PROTECT,
		],
		// Inline `style` props, next/font's and Clerk's injected styles.
		'style-src': ["'self'", "'unsafe-inline'"],
		// data: for drawn signatures, blob: for invoice photo previews.
		'img-src': ["'self'", 'data:', 'blob:', CLERK_IMAGES],
		// next/font self-hosts the Geist fonts.
		'font-src': ["'self'", 'data:'],
		'connect-src': [
			"'self'",
			...clerk,
			CLERK_IMAGES,
			'https://clerk-telemetry.com',
			'https://*.clerk-telemetry.com',
			`${CLERK_PROTECT}:*`,
			...(dev ? ['https://va.vercel-scripts.com'] : []),
		],
		'frame-src': ["'self'", TURNSTILE, CLERK_PROTECT],
		'worker-src': ["'self'", 'blob:'],
		'manifest-src': ["'self'"],
		'object-src': ["'none'"],
		'base-uri': ["'self'"],
		'frame-ancestors': ["'self'"],
	}
	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.join(' ')}`)
		.join('; ')
}

/** Every header sent on every route. */
export function securityHeaders(
	env: Record<string, string | undefined> = process.env,
): Header[] {
	return [
		{ key: 'X-Content-Type-Options', value: 'nosniff' },
		{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
		{ key: 'X-Frame-Options', value: 'SAMEORIGIN' },
		{
			key: 'Strict-Transport-Security',
			value: 'max-age=63072000; includeSubDomains',
		},
		{
			key: 'Permissions-Policy',
			// The trip form reads the location; nothing uses the rest.
			value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), serial=(), hid=(), midi=(), browsing-topics=()',
		},
		{ key: 'Content-Security-Policy', value: ENFORCED_CSP },
		{
			key: 'Content-Security-Policy-Report-Only',
			value: reportOnlyCsp({
				clerk: clerkOrigins(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
				dev: env.NODE_ENV !== 'production',
			}),
		},
	]
}
