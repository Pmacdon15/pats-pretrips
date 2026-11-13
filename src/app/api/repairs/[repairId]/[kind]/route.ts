import { getDriverEmail } from '@/lib/auth'
import { getRepairFileDb } from '@/lib/db/repairs'

/*
 * A repair's invoice or signature, for the signed-in driver who recorded it.
 * Served inline so a PDF or photo opens in the browser; ?download=1 saves it.
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

	const download = new URL(request.url).searchParams.has('download')
	const name = (file.name || `${kind}-${id}`).replace(/[^\w.\- ]+/g, '')
	return new Response(new Uint8Array(file.bytes), {
		headers: {
			'Content-Type': file.type,
			'Content-Length': String(file.bytes.length),
			'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
			'Cache-Control': 'private, max-age=3600',
			'X-Content-Type-Options': 'nosniff',
		},
	})
}
