import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ email: vi.fn(), getRepairFileDb: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getDriverEmail: mocks.email }))
vi.mock('@/lib/db/repairs', () => ({ getRepairFileDb: mocks.getRepairFileDb }))

import { GET } from '@/app/api/repairs/[repairId]/[kind]/route'

const get = (repairId: string, kind: string, query = '') =>
	GET(
		new Request(`https://app.test/api/repairs/${repairId}/${kind}${query}`),
		{
			params: Promise.resolve({ repairId, kind }),
		},
	)

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.getRepairFileDb.mockResolvedValue({
		bytes: Buffer.from('%PDF'),
		type: 'application/pdf',
		name: 'bill "1".pdf',
	})
})

const FILE_CSP =
	"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'self'"

describe('GET /api/repairs/[repairId]/[kind]', () => {
	it('always downloads a PDF invoice, sandboxed and private', async () => {
		const res = await get('7', 'invoice')
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('application/pdf')
		expect(res.headers.get('content-disposition')).toBe(
			'attachment; filename="bill 1.pdf"',
		)
		expect(res.headers.get('content-length')).toBe('4')
		expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
		expect(res.headers.get('x-content-type-options')).toBe('nosniff')
		expect(res.headers.get('content-security-policy')).toBe(FILE_CSP)
		expect(await res.text()).toBe('%PDF')
		expect(mocks.getRepairFileDb).toHaveBeenCalledWith(
			7,
			'pat@x.com',
			'invoice',
		)

		const download = await get('7', 'invoice', '?download=1')
		expect(download.headers.get('content-disposition')).toBe(
			'attachment; filename="bill 1.pdf"',
		)
	})

	it('shows a photo invoice inline, or saves it with ?download', async () => {
		mocks.getRepairFileDb.mockResolvedValue({
			bytes: Buffer.from('jpeg'),
			type: 'image/jpeg',
			name: 'bill.jpg',
		})
		const res = await get('7', 'invoice')
		expect(res.headers.get('content-type')).toBe('image/jpeg')
		expect(res.headers.get('content-disposition')).toBe(
			'inline; filename="bill.jpg"',
		)
		expect(res.headers.get('content-security-policy')).toBe(FILE_CSP)

		const download = await get('7', 'invoice', '?download')
		expect(download.headers.get('content-disposition')).toBe(
			'attachment; filename="bill.jpg"',
		)
	})

	it.each([
		'text/html',
		'image/svg+xml',
		'application/pdf; charset=utf-8',
		'',
	])('serves a stored type %j the app never writes as an opaque download', async (type) => {
		mocks.getRepairFileDb.mockResolvedValue({
			bytes: Buffer.from('<script>'),
			type,
			name: 'x.html',
		})
		const res = await get('7', 'invoice')
		expect(res.headers.get('content-type')).toBe('application/octet-stream')
		expect(res.headers.get('content-disposition')).toBe(
			'attachment; filename="x.html"',
		)
		expect(res.headers.get('content-security-policy')).toBe(FILE_CSP)
	})

	it('names a signature after the repair', async () => {
		mocks.getRepairFileDb.mockResolvedValue({
			bytes: Buffer.from('png'),
			type: 'image/png',
			name: null,
		})
		const res = await get('7', 'signature')
		expect(res.headers.get('content-disposition')).toBe(
			'inline; filename="signature-7"',
		)
	})

	it('answers 404 for other files, bad ids and someone else’s repair', async () => {
		expect((await get('7', 'other')).status).toBe(404)
		expect((await get('abc', 'invoice')).status).toBe(404)
		expect((await get('0', 'invoice')).status).toBe(404)
		mocks.getRepairFileDb.mockResolvedValue(undefined)
		expect((await get('7', 'invoice')).status).toBe(404)
	})

	it('answers 401 when signed out', async () => {
		mocks.email.mockResolvedValue(null)
		expect((await get('7', 'invoice')).status).toBe(401)
	})
})
