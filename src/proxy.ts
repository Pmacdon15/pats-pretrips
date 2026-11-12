import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware'
export default withAuth(async function middleware() {}, {
	publicPaths: [
		'/',
		// The MCP server checks its own Kinde token or API key, and answers 401
		// with a sign-in hint instead of a redirect, which MCP clients need.
		'/api/mcp',
		// OAuth discovery documents for MCP clients. Public by definition.
		'/.well-known/',
	],
})

export const config = {
	matcher: [
		'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
	],
}
