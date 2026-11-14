import { describe, expect, it } from 'vitest'
import { fileResponse } from '@/lib/file-response'
import {
	INLINE_FILE_TYPES,
	opensInline,
	STORED_FILE_TYPES,
} from '@/lib/file-types'
import { FILE_CSP } from '@/lib/security-headers'

describe('file types', () => {
	it('only knows the types the app writes', () => {
		expect([...STORED_FILE_TYPES].sort()).toEqual([
			'application/pdf',
			'image/jpeg',
			'image/png',
		])
		expect([...INLINE_FILE_TYPES].sort()).toEqual([
			'image/jpeg',
			'image/png',
		])
	})

	it('opens only images inline', () => {
		expect(opensInline('image/png')).toBe(true)
		expect(opensInline('image/jpeg')).toBe(true)
		expect(opensInline('application/pdf')).toBe(false)
		expect(opensInline('text/html')).toBe(false)
		expect(opensInline(null)).toBe(false)
		expect(opensInline(undefined)).toBe(false)
	})
})

describe('fileResponse', () => {
	const bytes = Buffer.from('abc')

	it('sends an image inline and inert', async () => {
		const res = fileResponse({ bytes, type: 'image/png', maxAge: 5 })
		expect(Object.fromEntries(res.headers)).toEqual({
			'content-type': 'image/png',
			'content-length': '3',
			'content-disposition': 'inline',
			'cache-control': 'private, max-age=5',
			'x-content-type-options': 'nosniff',
			'content-security-policy': FILE_CSP,
		})
		expect(await res.text()).toBe('abc')
	})

	it('downloads a PDF, an image asked for with download, and unknown types', () => {
		const disposition = (type: string, download?: boolean) =>
			fileResponse({
				bytes,
				type,
				name: 'f',
				download,
				maxAge: 0,
			}).headers.get('content-disposition')
		expect(disposition('application/pdf')).toBe('attachment; filename="f"')
		expect(disposition('image/jpeg', true)).toBe('attachment; filename="f"')
		expect(disposition('image/jpeg', false)).toBe('inline; filename="f"')
		const html = fileResponse({ bytes, type: 'text/html', maxAge: 0 })
		expect(html.headers.get('content-type')).toBe(
			'application/octet-stream',
		)
		expect(html.headers.get('content-disposition')).toBe('attachment')
	})
})
