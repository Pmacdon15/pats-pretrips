import {
	PDFDocument,
	type PDFFont,
	type PDFPage,
	PDFString,
	rgb,
	StandardFonts,
} from 'pdf-lib'
import type { Repair } from '@/lib/db/repairs'
import { repairLine } from '@/lib/repairs/status'
import type { Trip } from '@/lib/types/types'
import { formatTripCreated } from '@/lib/utils'
import { parseDefects } from '@/lib/utils-defects'
import { tripUrl } from './config'

/*
 * A one-page (or more, for long remarks) PDF of a pre-trip, with links back
 * to the trip in the app to edit it or add an on-route defect.
 */

const PAGE = { width: 612, height: 792 } // US Letter
const MARGIN = 54
const WIDTH = PAGE.width - MARGIN * 2
const INK = rgb(0.06, 0.09, 0.16)
const MUTED = rgb(0.39, 0.45, 0.55)
const GREEN = rgb(0.02, 0.59, 0.41)
const AMBER = rgb(0.85, 0.47, 0.02)
const LINE = rgb(0.89, 0.91, 0.94)

export type PdfDriver = { name: string; email: string }
/** A repair on the trip, with its signature (a PNG) when it has one. */
export type PdfRepair = Repair & { signature?: Uint8Array | null }

/** The standard PDF fonts only know Latin-1: anything else becomes "?". */
export function pdfSafe(value: string) {
	return (
		value
			.replace(/[‘’]/g, "'")
			.replace(/[“”]/g, '"')
			.replace(/[–—]/g, '-')
			// Some ICU versions put thin spaces in formatted times ("3:04 a.m.").
			.replace(/[\u2009\u202F]/g, ' ')
			.replace(/\r\n?/g, '\n')
			.replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?')
	)
}

/** Splits text into lines no wider than `width`, keeping its own line breaks. */
export function wrapText(
	text: string,
	font: PDFFont,
	size: number,
	width: number,
) {
	const lines: string[] = []
	for (const paragraph of pdfSafe(text).split('\n')) {
		let line = ''
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			const next = line ? `${line} ${word}` : word
			if (font.widthOfTextAtSize(next, size) <= width) {
				line = next
				continue
			}
			if (line) lines.push(line)
			// A single word wider than the page is cut into pieces.
			let rest = word
			while (font.widthOfTextAtSize(rest, size) > width) {
				let cut = rest.length - 1
				while (
					cut > 1 &&
					font.widthOfTextAtSize(rest.slice(0, cut), size) > width
				) {
					cut--
				}
				lines.push(rest.slice(0, cut))
				rest = rest.slice(cut)
			}
			line = rest
		}
		lines.push(line)
	}
	return lines
}

function addLink(
	doc: PDFDocument,
	page: PDFPage,
	url: string,
	box: { x: number; y: number; width: number; height: number },
) {
	const link = doc.context.register(
		doc.context.obj({
			Type: 'Annot',
			Subtype: 'Link',
			Rect: [box.x, box.y, box.x + box.width, box.y + box.height],
			Border: [0, 0, 0],
			A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
		}),
	)
	page.node.addAnnot(link)
}

export async function buildTripPdf(
	trip: Trip,
	driver: PdfDriver,
	timeZone?: string,
	repairs: PdfRepair[] = [],
): Promise<Uint8Array> {
	const doc = await PDFDocument.create()
	doc.setTitle(`Pre-trip inspection ${trip.tripid}`)
	doc.setAuthor(driver.name || driver.email)
	doc.setCreator("Pat's PreTrips")
	const regular = await doc.embedFont(StandardFonts.Helvetica)
	const bold = await doc.embedFont(StandardFonts.HelveticaBold)

	let page = doc.addPage([PAGE.width, PAGE.height])
	let y = PAGE.height - MARGIN

	/** Starts a new page when fewer than `needed` points are left. */
	const room = (needed: number) => {
		if (y - needed >= MARGIN) return
		page = doc.addPage([PAGE.width, PAGE.height])
		y = PAGE.height - MARGIN
	}
	const write = (
		text: string,
		opts: {
			size?: number
			font?: PDFFont
			color?: typeof INK
			x?: number
		} = {},
	) => {
		const size = opts.size ?? 11
		const font = opts.font ?? regular
		const x = opts.x ?? MARGIN
		for (const line of wrapText(text, font, size, WIDTH - (x - MARGIN))) {
			room(size + 4)
			y -= size
			page.drawText(line, { x, y, size, font, color: opts.color ?? INK })
			y -= 4
		}
	}
	const rule = () => {
		y -= 8
		page.drawLine({
			start: { x: MARGIN, y },
			end: { x: PAGE.width - MARGIN, y },
			thickness: 1,
			color: LINE,
		})
		y -= 14
	}
	const heading = (text: string) => {
		room(40)
		write(text.toUpperCase(), { size: 9, font: bold, color: MUTED })
		y -= 4
	}

	/** A repair's signature, about 40pt tall, or nothing if it can't be read. */
	const drawSignature = async (bytes: Uint8Array) => {
		let image: Awaited<ReturnType<typeof doc.embedPng>>
		try {
			image = await doc.embedPng(bytes)
		} catch {
			return
		}
		const scaled = image.scaleToFit(160, 40)
		room(scaled.height + 16)
		y -= scaled.height + 2
		page.drawImage(image, {
			x: MARGIN + 12,
			y,
			width: scaled.width,
			height: scaled.height,
		})
		y -= 4
		write('Signature', { size: 8, color: MUTED, x: MARGIN + 12 })
	}

	// Title
	write("PAT'S PRETRIPS", { size: 9, font: bold, color: GREEN })
	y -= 2
	write('Pre-trip inspection report', { size: 22, font: bold })
	write(`Created: ${formatTripCreated(trip.date, timeZone)}`, {
		size: 12,
		color: MUTED,
	})
	write(
		`Driver: ${[driver.name, driver.email].filter(Boolean).join(' · ')}`,
		{
			size: 11,
			color: MUTED,
		},
	)
	rule()

	// Vehicle & carrier, in two columns
	heading('Vehicle & carrier')
	const fields: [string, string][] = [
		['Carrier', trip.carrier],
		['Carrier address', trip.carrieraddress],
		['Inspection address', trip.inspectionaddress],
		['Make / model', [trip.make, trip.model].filter(Boolean).join(' ')],
		[
			'Odometer',
			trip.odometer ? `${trip.odometer.toLocaleString('en-CA')} km` : '',
		],
		['Truck plate', trip.truckplate ?? ''],
		[
			'Trailer plates',
			[trip.trailerplatea, trip.trailerplateb]
				.filter(Boolean)
				.join(' · '),
		],
	]
	const colWidth = (WIDTH - 24) / 2
	for (let i = 0; i < fields.length; i += 2) {
		const row = fields.slice(i, i + 2)
		const cells = row.map(([label, value]) => ({
			label,
			lines: wrapText(value || '-', regular, 11, colWidth),
		}))
		const height = 14 + Math.max(...cells.map((c) => c.lines.length)) * 15
		room(height + 8)
		cells.forEach((cell, col) => {
			const x = MARGIN + col * (colWidth + 24)
			let cy = y - 8
			page.drawText(pdfSafe(cell.label.toUpperCase()), {
				x,
				y: cy,
				size: 8,
				font: bold,
				color: MUTED,
			})
			cy -= 6
			for (const line of cell.lines) {
				cy -= 11
				page.drawText(line, {
					x,
					y: cy,
					size: 11,
					font: regular,
					color: INK,
				})
				cy -= 4
			}
		})
		y -= height + 8
	}
	rule()

	// Defects & remarks
	heading('Defects')
	const defects = parseDefects(trip.defects)
	if (defects.length === 0) {
		write('No defects reported', { font: bold, color: GREEN })
	} else {
		for (const defect of defects) {
			const repair = repairs.find(
				(r) => r.defect.toLowerCase() === defect.toLowerCase(),
			)
			if (!repair) {
				write(`!  ${defect} - not repaired yet`, {
					font: bold,
					color: AMBER,
				})
				continue
			}
			room(30)
			write(`${defect} - repaired`, { font: bold, color: GREEN })
			write(repairLine(repair), {
				size: 10,
				color: MUTED,
				x: MARGIN + 12,
			})
			if (repair.notes) {
				write(`Notes: ${repair.notes}`, {
					size: 10,
					color: MUTED,
					x: MARGIN + 12,
				})
			}
			if (repair.signature) await drawSignature(repair.signature)
			y -= 4
		}
	}
	y -= 8
	heading('Remarks')
	write(trip.remarks || '-')
	rule()

	// Links back to the app
	room(70)
	write('Need to change something or found a defect on the road?', {
		size: 10,
		color: MUTED,
	})
	y -= 8
	const url = tripUrl(trip.tripid)
	const buttons = [
		{ label: 'Open / edit this pre-trip', url },
		{ label: 'Add an on-route defect', url: `${url}#add-defect` },
	]
	let x = MARGIN
	const height = 26
	for (const button of buttons) {
		const width = bold.widthOfTextAtSize(button.label, 11) + 28
		page.drawRectangle({ x, y: y - height, width, height, color: GREEN })
		page.drawText(button.label, {
			x: x + 14,
			y: y - height + 9,
			size: 11,
			font: bold,
			color: rgb(1, 1, 1),
		})
		addLink(doc, page, button.url, { x, y: y - height, width, height })
		x += width + 12
	}
	y -= height + 12
	write(url, { size: 9, color: MUTED })
	write('On-route defects can be added for 24 hours after the inspection.', {
		size: 9,
		color: MUTED,
	})

	return doc.save()
}
