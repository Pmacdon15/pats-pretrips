import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
	'/',
	'/privacy',
	'/termsOfService',
	'/manifest.webmanifest',
	// The MCP server checks its own Clerk OAuth token or API key, and answers
	// 401 with a sign-in hint instead of a redirect, which MCP clients need.
	'/api/mcp(.*)',
	// OAuth discovery documents for MCP clients. Public by definition.
	'/.well-known/(.*)',
])

export default clerkMiddleware(async (auth, req) => {
	if (!isPublicRoute(req)) await auth.protect()
})

export const config = {
	matcher: [
		'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
		'/(api|trpc)(.*)',
	],
}
