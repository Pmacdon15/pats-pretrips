'use server'

import { getDriverEmail } from '@/lib/auth'
import { revalidateDriverTrips } from '@/lib/cache/revalidate'
import type { Repair } from '@/lib/db/repairs'
import { fromBase64 } from '@/lib/repairs/compress'
import { recordRepair, undoRepair } from '@/lib/repairs/repairs'

/*
 * Marking defects repaired from the web app. The form posts FormData: the
 * details, the drawn signature as a PNG data URL and, optionally, the invoice
 * file (photos are already shrunk in the browser; the server compresses
 * everything again before saving).
 */

const field = (form: FormData, name: string) => {
	const value = form.get(name)
	return typeof value === 'string' ? value : undefined
}

export async function markDefectRepaired(
	form: FormData,
): Promise<{ value: Repair } | { errorMessage: string }> {
	const email = await getDriverEmail()
	if (!email) return { errorMessage: 'Must be logged in' }

	const signature = field(form, 'signature')
	if (!signature?.startsWith('data:image/')) {
		return { errorMessage: 'Sign in the box to confirm the repair.' }
	}
	const file = form.get('invoice')
	const invoice =
		file instanceof File && file.size > 0
			? {
					bytes: new Uint8Array(await file.arrayBuffer()),
					name: file.name,
				}
			: null

	try {
		const result = await recordRepair(
			email,
			{
				tripId: Number(field(form, 'tripId')),
				defect: field(form, 'defect') ?? '',
				repairedOn: field(form, 'repairedOn') || undefined,
				mechanicName: field(form, 'mechanicName'),
				shopName: field(form, 'shopName'),
				invoiceNumber: field(form, 'invoiceNumber'),
				notes: field(form, 'notes'),
			},
			{ invoice, signature: fromBase64(signature) },
			'web',
		)
		if (!result.ok) return { errorMessage: result.message }
		revalidateDriverTrips(email)
		return { value: result.repair }
	} catch (error) {
		console.error('Error saving repair:', error)
		return { errorMessage: 'Could not save the repair. Please try again.' }
	}
}

export async function undoDefectRepair(
	repairId: number,
): Promise<{ value: { id: number } } | { errorMessage: string }> {
	const email = await getDriverEmail()
	if (!email) return { errorMessage: 'Must be logged in' }
	try {
		const removed = await undoRepair(email, repairId)
		if (!removed) return { errorMessage: 'That repair was not found.' }
		revalidateDriverTrips(email)
		return { value: { id: removed.id } }
	} catch (error) {
		console.error('Error undoing repair:', error)
		return { errorMessage: 'Could not undo the repair. Please try again.' }
	}
}
