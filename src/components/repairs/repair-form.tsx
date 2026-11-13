'use client'

import { Paperclip, Wrench } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { markDefectRepaired } from '@/lib/actions/repairs'
import { formatBytes, MAX_UPLOAD_BYTES, shrinkInvoice } from './compress-image'
import { SignaturePad } from './signature-pad'

/** Today in the driver's own time zone, as YYYY-MM-DD. */
function localToday() {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 10)
}

/** Marks one defect repaired: who fixed it, the invoice, and their signature. */
export function RepairForm({
	tripId,
	defect,
	onDone,
}: {
	tripId: number
	defect: string
	onDone: () => void
}) {
	const id = useId()
	const [mechanicName, setMechanicName] = useState('')
	const [shopName, setShopName] = useState('')
	const [invoiceNumber, setInvoiceNumber] = useState('')
	const [repairedOn, setRepairedOn] = useState(localToday)
	const [notes, setNotes] = useState('')
	const [signature, setSignature] = useState<string | null>(null)
	const [invoice, setInvoice] = useState<{ file: File; from: number } | null>(
		null,
	)
	const [compressing, setCompressing] = useState(false)
	const [pending, startTransition] = useTransition()

	const pickInvoice = async (file: File | undefined) => {
		if (!file) {
			setInvoice(null)
			return
		}
		setCompressing(true)
		const small = await shrinkInvoice(file)
		setCompressing(false)
		if (small.size > MAX_UPLOAD_BYTES) {
			toast.error('Invoice too large', {
				description: `It's ${formatBytes(small.size)}. Upload a photo or a PDF under 4.5 MB.`,
			})
			setInvoice(null)
			return
		}
		setInvoice({ file: small, from: file.size })
	}

	const save = () => {
		if (mechanicName.trim().length < 2) {
			toast.error('Add who repaired it')
			return
		}
		if (!signature) {
			toast.error('The mechanic needs to sign in the box')
			return
		}
		const form = new FormData()
		form.set('tripId', String(tripId))
		form.set('defect', defect)
		form.set('mechanicName', mechanicName)
		form.set('shopName', shopName)
		form.set('invoiceNumber', invoiceNumber)
		form.set('repairedOn', repairedOn)
		form.set('notes', notes)
		form.set('signature', signature)
		if (invoice) form.set('invoice', invoice.file)
		startTransition(async () => {
			const res = await markDefectRepaired(form)
			if ('errorMessage' in res) {
				toast.error('Could not save the repair', {
					description: res.errorMessage,
				})
				return
			}
			toast.success(`${defect} marked repaired`)
			onDone()
		})
	}

	return (
		<form
			aria-label={`Repair ${defect}`}
			className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				save()
			}}
		>
			<p className="flex items-center gap-2 font-medium">
				<Wrench className="size-4" />
				Repair: {defect}
			</p>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor={`${id}-mechanic`}>Repaired by</Label>
					<Input
						autoComplete="name"
						id={`${id}-mechanic`}
						maxLength={120}
						onChange={(e) => setMechanicName(e.target.value)}
						placeholder="Mechanic’s name"
						required
						value={mechanicName}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${id}-shop`}>Shop (optional)</Label>
					<Input
						autoComplete="organization"
						id={`${id}-shop`}
						maxLength={120}
						onChange={(e) => setShopName(e.target.value)}
						placeholder="e.g. Highway Truck Repair"
						value={shopName}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${id}-invoice-number`}>
						Invoice number
					</Label>
					<Input
						id={`${id}-invoice-number`}
						maxLength={60}
						onChange={(e) => setInvoiceNumber(e.target.value)}
						placeholder="e.g. INV-10482"
						value={invoiceNumber}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor={`${id}-date`}>Repaired on</Label>
					<Input
						id={`${id}-date`}
						max={localToday()}
						onChange={(e) => setRepairedOn(e.target.value)}
						type="date"
						value={repairedOn}
					/>
				</div>
			</div>
			<div className="grid gap-2">
				<Label htmlFor={`${id}-file`}>Invoice (photo or PDF)</Label>
				<Input
					accept="image/*,application/pdf"
					id={`${id}-file`}
					onChange={(e) => pickInvoice(e.target.files?.[0])}
					type="file"
				/>
				<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<Paperclip className="size-3" />
					{compressing
						? 'Compressing…'
						: invoice
							? invoice.file.size < invoice.from
								? `Compressed ${formatBytes(invoice.from)} → ${formatBytes(invoice.file.size)}`
								: `${formatBytes(invoice.file.size)}`
							: 'Photos are compressed before upload.'}
				</p>
			</div>
			<div className="grid gap-2">
				<Label htmlFor={`${id}-notes`}>Notes (optional)</Label>
				<Textarea
					id={`${id}-notes`}
					maxLength={2000}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="What was done, parts replaced…"
					value={notes}
				/>
			</div>
			<SignaturePad
				label="Mechanic’s signature"
				onChange={setSignature}
			/>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					disabled={pending}
					onClick={onDone}
					type="button"
					variant="ghost"
				>
					Cancel
				</Button>
				<Button
					className="h-11 px-6"
					disabled={pending || compressing}
					type="submit"
				>
					{pending ? 'Saving…' : 'Mark repaired'}
				</Button>
			</div>
		</form>
	)
}
