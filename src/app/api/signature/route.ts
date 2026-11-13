import { getDriverEmail } from '@/lib/auth'
import { getSavedSignatureDb } from '@/lib/db/signatures'
import { signatureResponse } from '@/lib/signatures/response'

/* The signed-in driver's saved signature, as an image. */
export async function GET() {
	const email = await getDriverEmail()
	if (!email) return new Response('Sign in first', { status: 401 })
	return signatureResponse(await getSavedSignatureDb(email))
}
