import { randomBytes } from 'node:crypto'

/*
 * A raw MIME message (text + HTML + one attachment, and optionally images the
 * HTML shows inline by cid:) for SES SendEmail's Raw content. Written by hand
 * so no mail library is needed.
 */

/** An image the HTML shows with <img src="cid:{cid}">. */
export type InlineImage = {
	cid: string
	filename: string
	contentType: string
	content: Uint8Array
}

export type MimeMessage = {
	from: string
	to: string[]
	replyTo?: string
	subject: string
	text: string
	html: string
	attachment: { filename: string; contentType: string; content: Uint8Array }
	inline?: InlineImage[]
}

const cleanName = (value: string) => value.replace(/["\\\r\n]/g, '')
const cleanCid = (value: string) => value.replace(/[<>\s]/g, '')

/** RFC 2047 encoding for headers that aren't plain ASCII. */
export function encodeHeader(value: string) {
	if (/^[\x20-\x7E]*$/.test(value)) return value
	return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** Base64 in 76-character lines, as MIME wants. */
export function base64Lines(content: Uint8Array | string) {
	const encoded = Buffer.from(content).toString('base64')
	return encoded.match(/.{1,76}/g)?.join('\r\n') ?? ''
}

export function buildMimeMessage(
	message: MimeMessage,
	boundary = randomBytes(12).toString('hex'),
) {
	const mixed = `mixed_${boundary}`
	const alt = `alt_${boundary}`
	const related = `related_${boundary}`
	const filename = cleanName(message.attachment.filename)
	const inline = message.inline ?? []
	const alternative = [
		`Content-Type: multipart/alternative; boundary="${alt}"`,
		'',
		`--${alt}`,
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		base64Lines(message.text),
		`--${alt}`,
		'Content-Type: text/html; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		base64Lines(message.html),
		`--${alt}--`,
		'',
	]
	// With inline images, the text and HTML sit in a multipart/related next
	// to the images the HTML points at.
	const body = inline.length
		? [
				`Content-Type: multipart/related; boundary="${related}"`,
				'',
				`--${related}`,
				...alternative,
				...inline.flatMap((image) => {
					const name = cleanName(image.filename)
					return [
						`--${related}`,
						`Content-Type: ${image.contentType}; name="${name}"`,
						`Content-Disposition: inline; filename="${name}"`,
						`Content-ID: <${cleanCid(image.cid)}>`,
						'Content-Transfer-Encoding: base64',
						'',
						base64Lines(image.content),
					]
				}),
				`--${related}--`,
				'',
			]
		: alternative
	const lines = [
		`From: ${message.from}`,
		`To: ${message.to.join(', ')}`,
		...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
		`Subject: ${encodeHeader(message.subject)}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/mixed; boundary="${mixed}"`,
		'',
		`--${mixed}`,
		...body,
		`--${mixed}`,
		`Content-Type: ${message.attachment.contentType}; name="${filename}"`,
		`Content-Disposition: attachment; filename="${filename}"`,
		'Content-Transfer-Encoding: base64',
		'',
		base64Lines(message.attachment.content),
		`--${mixed}--`,
		'',
	]
	return lines.join('\r\n')
}
