/*
 * A caught error as the server logs (Vercel's runtime logs) show it.
 *
 * Not the error object itself: Node prints every field, and a Postgres
 * error from @neondatabase/serverless carries `detail`, `where` and
 * `internalQuery`, where a refused row comes back whole ("Failing row
 * contains (...)": the driver's email, notes, plate and file bytes) and a
 * duplicate key comes back with its values. Its code (the SQLSTATE), name,
 * message and stack are kept, with email addresses (an SES rejection names
 * the addresses it refused) and a connection string's password taken out.
 */

const CONNECTION_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)[^\s/@]*@/gi
const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi

const scrub = (text: string) =>
	text.replace(CONNECTION_PASSWORD, '$1[hidden]@').replace(EMAIL, '[email]')

export function errorForLog(error: unknown): string {
	if (!(error instanceof Error)) return scrub(String(error))
	const code = (error as { code?: unknown }).code
	const text = error.stack ?? `${error.name}: ${error.message}`
	return scrub(
		typeof code === 'string' || typeof code === 'number'
			? `[${code}] ${text}`
			: text,
	)
}
