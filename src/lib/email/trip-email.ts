import type { Trip } from '@/lib/types/types'
import { formatTripCreated, tripDayAndTime } from '@/lib/utils'
import { parseDefects } from '@/lib/utils-defects'
import { fromAddress, tripUrl } from './config'
import { buildMimeMessage } from './mime'
import { buildTripPdf, type PdfDriver } from './pdf'
import { sendRawEmail } from './ses'

const escapeHtml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')

export type TripEmail = {
	subject: string
	text: string
	html: string
	filename: string
}

/** The words of a pre-trip email; the PDF goes with it. */
export function tripEmailContent(
	trip: Trip,
	driver: PdfDriver,
	timeZone?: string,
): TripEmail {
	const when = formatTripCreated(trip.date, timeZone)
	const { day, time } = tripDayAndTime(trip.date, timeZone)
	const unit = [trip.make, trip.model].filter(Boolean).join(' ')
	const plate = trip.truckplate ? ` (${trip.truckplate})` : ''
	const defects = parseDefects(trip.defects)
	const status = defects.length
		? `Defects: ${defects.join(', ')}`
		: 'No defects reported'
	const who = driver.name || driver.email
	const url = tripUrl(trip.tripid)
	const defectUrl = `${url}#add-defect`

	const text = [
		`Pre-trip inspection by ${who}`,
		`Created: ${when}`,
		`${unit}${plate}, ${trip.odometer.toLocaleString('en-CA')} km`,
		`Carrier: ${trip.carrier}`,
		`Carrier address: ${trip.carrieraddress || '-'}`,
		`Inspected at: ${trip.inspectionaddress}`,
		status,
		`Remarks: ${trip.remarks || '-'}`,
		'',
		'The full report is attached as a PDF.',
		`Open or edit this pre-trip: ${url}`,
		`Add an on-route defect: ${defectUrl}`,
	].join('\n')

	const e = escapeHtml
	const button = (href: string, label: string) =>
		`<a href="${e(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border-radius:6px;background:#059669;color:#ffffff;font-weight:600;text-decoration:none">${e(label)}</a>`
	const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0;color:#059669;font-size:12px;font-weight:700;letter-spacing:1px">PAT'S PRETRIPS</p>
<h1 style="margin:4px 0 4px;font-size:22px">Pre-trip inspection</h1>
<p style="margin:0 0 16px;color:#64748b">${e(who)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:4px 0;color:#64748b">Created</td><td style="padding:4px 0">${e(when)}</td></tr>
<tr><td style="padding:4px 0;color:#64748b">Unit</td><td style="padding:4px 0">${e(unit + plate)}</td></tr>
<tr><td style="padding:4px 0;color:#64748b">Odometer</td><td style="padding:4px 0">${e(trip.odometer.toLocaleString('en-CA'))} km</td></tr>
<tr><td style="padding:4px 0;color:#64748b">Carrier</td><td style="padding:4px 0">${e(trip.carrier)}</td></tr>
<tr><td style="padding:4px 0;color:#64748b">Carrier address</td><td style="padding:4px 0">${e(trip.carrieraddress || '-')}</td></tr>
<tr><td style="padding:4px 0;color:#64748b">Inspected at</td><td style="padding:4px 0">${e(trip.inspectionaddress)}</td></tr>
</table>
<p style="margin:16px 0 4px;font-weight:700;color:${defects.length ? '#d97706' : '#059669'}">${e(status)}</p>
<p style="margin:0 0 20px;white-space:pre-line">${e(trip.remarks || '-')}</p>
${button(url, 'Open / edit this pre-trip')}${button(defectUrl, 'Add an on-route defect')}
<p style="margin:12px 0 0;color:#64748b;font-size:12px">The full report is attached as a PDF. On-route defects can be added for 24 hours after the inspection.</p>
</div></body></html>`

	return {
		subject: `Pre-trip ${day} ${time} - ${unit}${plate}${defects.length ? ' - defects reported' : ''}`,
		text,
		html,
		filename: `pretrip-${trip.tripid}-${day}.pdf`,
	}
}

/**
 * Emails the pre-trip, with its PDF, to `to`. Replies go to the driver.
 * Throws when SES isn't set up or refuses the message.
 */
export async function sendTripEmail(
	trip: Trip,
	driver: PdfDriver,
	to: string[],
	timeZone?: string,
) {
	const from = fromAddress()
	if (!from) throw new Error('SES_FROM_EMAIL is not set')
	const content = tripEmailContent(trip, driver, timeZone)
	const pdf = await buildTripPdf(trip, driver, timeZone)
	const raw = buildMimeMessage({
		from,
		to,
		replyTo: driver.email,
		subject: content.subject,
		text: content.text,
		html: content.html,
		attachment: {
			filename: content.filename,
			contentType: 'application/pdf',
			content: pdf,
		},
	})
	return sendRawEmail(raw)
}
