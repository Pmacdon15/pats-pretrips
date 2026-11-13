import { getDriverEmail } from '@/lib/auth'
import { getTripSignatureDb } from '@/lib/db/signatures'
import { signatureResponse } from '@/lib/signatures/response'

/* The driver's signature on one of their pre-trips, as an image. */
export async function GET(
	_request: Request,
	ctx: RouteContext<'/api/trips/[tripId]/signature'>,
) {
	const { tripId } = await ctx.params
	const id = Number(tripId)
	if (!Number.isInteger(id) || id < 1) {
		return new Response('Not found', { status: 404 })
	}
	const email = await getDriverEmail()
	if (!email) return new Response('Sign in first', { status: 401 })
	return signatureResponse(await getTripSignatureDb(id, email))
}
