// next-sitemap.config.js
module.exports = {
	siteUrl: 'https://patspretrips.ca',
	generateRobotsTxt: true,
	sitemapSize: 7000,
	// The static-shell canary page isn't for people.
	exclude: ['/shell-check'],
}
