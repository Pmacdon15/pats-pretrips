import { getDriverEmail } from '@/lib/auth'
import { getRepairFileDb } from '@/lib/db/repairs'
import { fileResponse } from '@/lib/file-response'

/*
 * A repair's invoice or signature, for the signed-in driver who recorded it.
 * A photo or signature opens in the browser (sandboxed); a PDF invoice always
 * downloads, see fileResponse. ?download=1 saves an image too.
 */
export async function GET(
	request: Request,
	ctx: RouteContext<'/api/repairs/[repairId]/[kind]'>,
) {
	const { repairId, kind } = await ctx.params
	if (kind !== 'invoice' && kind !== 'signature') {
		return new Response('Not found', { status: 404 })
	}
	const id = Number(repairId)
	if (!Number.isInteger(id) || id < 1) {
		return new Response('Not found', { status: 404 })
	}
	const email = await getDriverEmail()
	if (!email) return new Response('Sign in first', { status: 401 })

	const file = await getRepairFileDb(id, email, kind)
	if (!file) return new Response('Not found', { status: 404 })

	return fileResponse({
		bytes: file.bytes,
		type: file.type,
		name: (file.name || `${kind}-${id}`).replace(/[^\w.\- ]+/g, ''),
		download: new URL(request.url).searchParams.has('download'),
		maxAge: 3600,
	})
}
