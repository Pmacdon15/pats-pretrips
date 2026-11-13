'use client'

import { FileText, Undo2 } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { undoDefectRepair } from '@/lib/actions/repairs'
import type { Repair } from '@/lib/db/repairs'
import { repairFilePath } from '@/lib/repairs/paths'

/** YYYY-MM-DD as a short date, without shifting it to another day. */
export function repairDate(value: string) {
	return new Date(`${value}T12:00:00`).toLocaleDateString('en-CA', {
		dateStyle: 'medium',
	})
}

/** Who repaired a defect, when, the invoice and the signature. */
export function RepairSummary({ repair }: { repair: Repair }) {
	const [pending, startTransition] = useTransition()

	const undo = () => {
		if (
			!window.confirm(
				`Undo the repair of ${repair.defect}? It shows as open again and its invoice and signature are deleted.`,
			)
		) {
			return
		}
		startTransition(async () => {
			const res = await undoDefectRepair(repair.id)
			if ('errorMessage' in res) {
				toast.error('Could not undo', { description: res.errorMessage })
				return
			}
			toast.success(`${repair.defect} is open again`)
		})
	}

	return (
		<div className="flex flex-col gap-3 text-sm">
			<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
				<div>
					<dt className="text-muted-foreground text-xs">
						Repaired on
					</dt>
					<dd>{repairDate(repair.repaired_on)}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">
						Repaired by
					</dt>
					<dd>
						{repair.mechanic_name}
						{repair.shop_name ? `, ${repair.shop_name}` : ''}
					</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">
						Invoice number
					</dt>
					<dd>{repair.invoice_number || '—'}</dd>
				</div>
				<div>
					<dt className="text-muted-foreground text-xs">Invoice</dt>
					<dd>
						{repair.has_invoice ? (
							<a
								className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
								href={repairFilePath(repair.id, 'invoice')}
								rel="noopener"
								target="_blank"
							>
								<FileText className="size-3.5" />
								View invoice
							</a>
						) : (
							'—'
						)}
					</dd>
				</div>
				{repair.notes ? (
					<div className="sm:col-span-2">
						<dt className="text-muted-foreground text-xs">Notes</dt>
						<dd className="whitespace-pre-line">{repair.notes}</dd>
					</div>
				) : null}
			</dl>
			<div className="flex flex-wrap items-end justify-between gap-3">
				{repair.has_signature ? (
					<figure>
						{/* biome-ignore lint/performance/noImgElement: a private file, not an optimisable asset */}
						<img
							alt={`Signature of ${repair.mechanic_name}`}
							className="h-14 w-auto rounded border bg-white p-1"
							height={56}
							src={repairFilePath(repair.id, 'signature')}
							width={168}
						/>
						<figcaption className="mt-1 text-muted-foreground text-xs">
							Signed by {repair.mechanic_name}
						</figcaption>
					</figure>
				) : (
					<p className="text-muted-foreground text-xs">
						No signature
						{repair.source !== 'web'
							? ` (recorded by ${repair.source})`
							: ''}
					</p>
				)}
				<Button
					disabled={pending}
					onClick={undo}
					size="sm"
					type="button"
					variant="ghost"
				>
					<Undo2 />
					{pending ? 'Undoing…' : 'Undo repair'}
				</Button>
			</div>
		</div>
	)
}
