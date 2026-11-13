import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({ send: vi.fn(), ctor: vi.fn() }))
vi.mock('@aws-sdk/client-sesv2', () => ({
	SESv2Client: class {
		constructor(config: unknown) {
			mocks.ctor(config)
		}
		send = mocks.send
	},
	SendEmailCommand: class {
		constructor(public input: unknown) {}
	},
}))

import { appUrl, EMAIL_FEATURE, fromAddress, tripUrl } from '@/lib/email/config'
import { base64Lines, buildMimeMessage, encodeHeader } from '@/lib/email/mime'
import { buildTripPdf, pdfSafe, wrapText } from '@/lib/email/pdf'
import {
	emailSettingsSchema,
	emailTripSchema,
	isTimeZone,
	recipientsSchema,
	splitRecipients,
} from '@/lib/email/recipients'
import { sendRawEmail, sesClient } from '@/lib/email/ses'
import { sendTripEmail, tripEmailContent } from '@/lib/email/trip-email'

const driver = { name: 'Pat Mac', email: 'pat@x.com' }

beforeEach(() => {
	mocks.send.mockResolvedValue({ MessageId: 'msg-1' })
})

describe('config', () => {
	it('links to the live site unless APP_URL says otherwise', () => {
		expect(EMAIL_FEATURE).toBe('email_pretrips')
		expect(appUrl()).toBe('https://patspretrips.ca')
		expect(tripUrl(4)).toBe('https://patspretrips.ca/pretrip/4')
		vi.stubEnv('APP_URL', 'http://localhost:3000/')
		expect(tripUrl(4)).toBe('http://localhost:3000/pretrip/4')
	})

	it('reads the sender from SES_FROM_EMAIL', () => {
		vi.stubEnv('SES_FROM_EMAIL', '')
		expect(fromAddress()).toBeNull()
		vi.stubEnv('SES_FROM_EMAIL', 'trips@x.com')
		expect(fromAddress()).toBe('trips@x.com')
	})
})

describe('recipients', () => {
	it('splits on commas, semicolons and spaces, without repeats', () => {
		expect(splitRecipients(' A@x.com; b@x.com,a@x.com  c@x.com ,')).toEqual(
			['a@x.com', 'b@x.com', 'c@x.com'],
		)
	})

	it('needs 1 to 5 real addresses', () => {
		expect(recipientsSchema.parse('a@x.com')).toEqual(['a@x.com'])
		expect(recipientsSchema.safeParse(' ').error?.issues[0].message).toBe(
			'Add at least one email address',
		)
		expect(
			recipientsSchema.safeParse('a@x.com, nope').error?.issues[0]
				.message,
		).toBe('"nope" is not an email address')
		expect(
			recipientsSchema.safeParse(
				'a@x.co b@x.co c@x.co d@x.co e@x.co f@x.co',
			).error?.issues[0].message,
		).toBe('At most 5 email addresses')
	})

	it('knows real time zones', () => {
		expect(isTimeZone('America/Edmonton')).toBe(true)
		expect(isTimeZone('Mars/Base')).toBe(false)
		expect(
			emailSettingsSchema.safeParse({
				recipients: '',
				autoSend: false,
				timeZone: 'Mars/Base',
			}).success,
		).toBe(false)
		expect(
			emailTripSchema.parse({ tripId: 1, recipients: 'a@x.com' }),
		).toEqual({ tripId: 1, recipients: ['a@x.com'] })
	})
})

describe('mime', () => {
	it('encodes non-ASCII headers', () => {
		expect(encodeHeader('Plain')).toBe('Plain')
		expect(encodeHeader('Café')).toBe(
			`=?UTF-8?B?${Buffer.from('Café').toString('base64')}?=`,
		)
	})

	it('wraps base64 at 76 characters', () => {
		const lines = base64Lines('x'.repeat(100)).split('\r\n')
		expect(lines[0]).toHaveLength(76)
		expect(lines).toHaveLength(2)
		expect(base64Lines('')).toBe('')
	})

	it('builds text, HTML and an attachment', () => {
		const raw = buildMimeMessage(
			{
				from: 'PreTrips <t@x.com>',
				to: ['a@x.com', 'b@x.com'],
				replyTo: 'pat@x.com',
				subject: 'Hi',
				text: 'text',
				html: '<p>html</p>',
				attachment: {
					filename: 'a"b.pdf',
					contentType: 'application/pdf',
					content: new Uint8Array([1, 2, 3]),
				},
			},
			'b1',
		)
		expect(raw).toContain('To: a@x.com, b@x.com\r\n')
		expect(raw).toContain('Reply-To: pat@x.com\r\n')
		expect(raw).toContain('boundary="mixed_b1"')
		expect(raw).toContain('filename="ab.pdf"')
		expect(raw).toContain(Buffer.from('<p>html</p>').toString('base64'))
		expect(raw.endsWith('--mixed_b1--\r\n')).toBe(true)
	})

	it('leaves out Reply-To and picks a random boundary', () => {
		const raw = buildMimeMessage({
			from: 't@x.com',
			to: ['a@x.com'],
			subject: 'Hi',
			text: 't',
			html: 'h',
			attachment: {
				filename: 'a.pdf',
				contentType: 'application/pdf',
				content: new Uint8Array([1]),
			},
		})
		expect(raw).not.toContain('Reply-To')
		expect(raw).toMatch(/boundary="mixed_[0-9a-f]{24}"/)
	})
})

describe('pdf', () => {
	it('keeps only what the standard fonts can draw', () => {
		expect(pdfSafe('‘a’ “b” c–d—e\r\nf ✅ é')).toBe(`'a' "b" c-d-e\nf ? é`)
	})

	it('wraps words, keeps line breaks and cuts very long words', async () => {
		const doc = await PDFDocument.create()
		const font = await doc.embedFont(StandardFonts.Helvetica)
		expect(wrapText('one two three', font, 10, 1000)).toEqual([
			'one two three',
		])
		expect(wrapText('one two\n\nthree', font, 10, 1000)).toEqual([
			'one two',
			'',
			'three',
		])
		const narrow = wrapText('aaaa bbbb', font, 10, 30)
		expect(narrow).toEqual(['aaaa', 'bbbb'])
		const cut = wrapText(`x ${'W'.repeat(20)}`, font, 10, 30)
		expect(cut[0]).toBe('x')
		expect(cut.slice(1).join('')).toBe('W'.repeat(20))
		expect(wrapText('W'.repeat(20), font, 10, 30).join('')).toBe(
			'W'.repeat(20),
		)
		for (const line of cut) {
			expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(30)
		}
	})

	const links = async (bytes: Uint8Array) => {
		const doc = await PDFDocument.load(bytes)
		return doc.getPages().flatMap((page) => {
			const annots = page.node.Annots()
			if (!annots) return []
			return annots.asArray().map((ref) => {
				const annot = doc.context.lookup(ref) as never as {
					get: (n: PDFName) => { get: (n: PDFName) => unknown }
				}
				return String(annot.get(PDFName.of('A')).get(PDFName.of('URI')))
			})
		})
	}

	it('draws the trip with links to edit it and add a defect', async () => {
		const bytes = await buildTripPdf(trip(), driver, 'America/Edmonton')
		const doc = await PDFDocument.load(bytes)
		expect(doc.getTitle()).toBe('Pre-trip inspection 1')
		expect(doc.getAuthor()).toBe('Pat Mac')
		expect(doc.getPageCount()).toBe(1)
		expect(await links(bytes)).toEqual([
			'(https://patspretrips.ca/pretrip/1)',
			'(https://patspretrips.ca/pretrip/1#add-defect)',
		])
	})

	it('handles empty fields, no defects and long remarks over pages', async () => {
		const bytes = await buildTripPdf(
			trip({
				defects: '',
				remarks: '',
				odometer: 0,
				truckplate: undefined,
				trailerplatea: '',
				trailerplateb: '',
				make: '',
			}),
			{ name: '', email: 'pat@x.com' },
		)
		const doc = await PDFDocument.load(bytes)
		expect(doc.getAuthor()).toBe('pat@x.com')

		const long = await buildTripPdf(
			trip({ remarks: 'Line\n'.repeat(120) }),
			driver,
		)
		const longDoc = await PDFDocument.load(long)
		expect(longDoc.getPageCount()).toBeGreaterThan(1)
		expect(await links(long)).toHaveLength(2)
	})

	it('starts a new page for a field row or links near the bottom', async () => {
		for (const lines of [24, 31, 36]) {
			const bytes = await buildTripPdf(
				trip({
					inspectionaddress: 'Street\n'.repeat(lines),
					remarks: 'r',
				}),
				driver,
			)
			expect(await links(bytes)).toHaveLength(2)
		}
	})
})

describe('ses', () => {
	it('sends the raw message with one shared client', async () => {
		expect(sesClient()).toBe(sesClient())
		await expect(sendRawEmail('raw')).resolves.toBe('msg-1')
		const command = mocks.send.mock.calls[0][0] as {
			input: { Content: { Raw: { Data: Buffer } } }
		}
		expect(command.input.Content.Raw.Data.toString()).toBe('raw')
		mocks.send.mockResolvedValue({})
		await expect(sendRawEmail('raw')).resolves.toBeNull()
	})
})

describe('trip email', () => {
	it('summarises the trip with links back to the app', () => {
		const content = tripEmailContent(
			trip({ remarks: '<b>bad</b> & "x"' }),
			driver,
			'UTC',
		)
		expect(content.subject).toBe(
			'Pre-trip 2026-01-02 - Volvo VNL (TRK1) - defects reported',
		)
		expect(content.filename).toBe('pretrip-1-2026-01-02.pdf')
		expect(content.text).toContain('Pre-trip inspection by Pat Mac')
		expect(content.text).toContain('Defects: Cab')
		expect(content.text).toContain('Carrier address: 1 Main St')
		expect(content.html).toContain(
			'Carrier address</td><td style="padding:4px 0">1 Main St',
		)
		expect(content.text).toContain(
			'Add an on-route defect: https://patspretrips.ca/pretrip/1#add-defect',
		)
		expect(content.html).toContain(
			'&lt;b&gt;bad&lt;/b&gt; &amp; &quot;x&quot;',
		)
		expect(content.html).toContain('#d97706')
	})

	it('reads well with no defects, plate or remarks', () => {
		const content = tripEmailContent(
			trip({ defects: '', truckplate: '', remarks: "it's" }),
			{ name: '', email: 'pat@x.com' },
		)
		expect(content.subject).toBe('Pre-trip 2026-01-02 - Volvo VNL')
		expect(content.text).toContain('by pat@x.com')
		expect(content.text).toContain('No defects reported')
		expect(content.html).toContain('#059669">No defects')
		expect(content.html).toContain('it&#39;s')
		expect(tripEmailContent(trip({ remarks: '' }), driver).text).toContain(
			'Remarks: -',
		)
		expect(
			tripEmailContent(trip({ carrieraddress: '' }), driver).text,
		).toContain('Carrier address: -')
	})

	it('needs SES_FROM_EMAIL', async () => {
		vi.stubEnv('SES_FROM_EMAIL', '')
		await expect(
			sendTripEmail(trip(), driver, ['a@x.com']),
		).rejects.toThrow('SES_FROM_EMAIL is not set')
	})

	it('sends the PDF to the recipients, with replies to the driver', async () => {
		vi.stubEnv('SES_FROM_EMAIL', 'PreTrips <t@x.com>')
		await expect(
			sendTripEmail(trip(), driver, ['a@x.com'], 'UTC'),
		).resolves.toBe('msg-1')
		const command = mocks.send.mock.calls[0][0] as {
			input: { Content: { Raw: { Data: Buffer } } }
		}
		const raw = command.input.Content.Raw.Data.toString()
		expect(raw).toContain('From: PreTrips <t@x.com>')
		expect(raw).toContain('To: a@x.com')
		expect(raw).toContain('Reply-To: pat@x.com')
		expect(raw).toContain('filename="pretrip-1-2026-01-02.pdf"')
	})
})
