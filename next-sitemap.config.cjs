// next-sitemap config. Runs after `next build` (see "postbuild" in
// package.json) and writes public/sitemap.xml, public/sitemap-0.xml and
// public/robots.txt.

/**
 * Pages anyone can open without signing in. Everything else is behind Clerk
 * (see src/proxy.ts) and only redirects crawlers to /sign-in, so it stays
 * out of the sitemap.
 */
const PUBLIC_PAGES = {
	'/': { priority: 1.0, changefreq: 'weekly' },
	'/sign-up': { priority: 0.6, changefreq: 'monthly' },
	'/sign-in': { priority: 0.4, changefreq: 'monthly' },
	'/privacy': { priority: 0.3, changefreq: 'yearly' },
	'/termsOfService': { priority: 0.3, changefreq: 'yearly' },
}

/** Signed-in app pages and APIs crawlers shouldn't spend time on. */
const PRIVATE_PATHS = [
	'/api/',
	'/pretrip', // also covers /pretrips
	'/defects',
	'/vehicles',
	'/carriers',
	'/email',
	'/signature',
	'/connect',
	'/shell-check',
]

/** @type {import('next-sitemap').IConfig} */
module.exports = {
	siteUrl: 'https://patspretrips.ca',
	generateRobotsTxt: true,
	sitemapSize: 7000,
	autoLastmod: true,
	// Keep the default list small; `transform` below is the real filter.
	exclude: ['/shell-check', '/api/*', '/icon.svg', '/apple-icon.png'],
	// Build-time pages (sign-in/sign-up are catch-alls, so add them by hand).
	additionalPaths: async (config) =>
		Promise.all(
			['/sign-in', '/sign-up'].map((path) =>
				config.transform(config, path),
			),
		),
	transform: async (config, path) => {
		const page = PUBLIC_PAGES[path]
		if (!page) return null
		return {
			loc: path,
			changefreq: page.changefreq,
			priority: page.priority,
			lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
		}
	},
	robotsTxtOptions: {
		policies: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
	},
}
