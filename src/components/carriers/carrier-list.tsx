'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteCarrier } from '@/lib/actions/carriers'
import type { Carrier } from '@/lib/db/carriers'
import { CARRIERS_KEY, useCarriers } from '@/lib/hooks/hooks'
import { useSpace } from '@/lib/hooks/space'
import { CARRIERS_MAX, formatLimit } from '@/lib/trip-limits'
import { CarrierForm } from './carrier-form'

/**
 * The space's saved carriers (the driver's own, or their organization's):
 * add one, edit one or delete one, when the driver manages the space. Pick one on
 * a new pre-trip to fill in the carrier and its address.
 */
export function CarrierList() {
	const { data: carriers = [], isPending } = useCarriers()
	const { inOrg, canManage } = useSpace()
	// 'new' while adding, a carrier's id while editing it.
	const [editing, setEditing] = useState<'new' | number | null>(null)

	if (isPending) {
		return <div className="h-32 animate-pulse rounded-md bg-muted" />
	}

	const full = carriers.length >= CARRIERS_MAX

	return (
		<div className="flex flex-col gap-4">
			{inOrg && canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These carriers are shared with everyone in your
					organization. As an admin, you can change them.
				</p>
			)}
			{!canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These are your organization&apos;s carriers. Only its admins
					can add, change or delete them.
				</p>
			)}
			{carriers.length === 0 && editing !== 'new' && !canManage && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					Your organization has no saved carriers yet.
				</p>
			)}
			{carriers.length === 0 && editing !== 'new' && canManage && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					No saved carriers yet. Add the companies you haul for, then
					pick one when you start a pre-trip.
				</p>
			)}
			<ul className="flex flex-col gap-3">
				{carriers.map((c) => (
					<li className="rounded-md border p-4" key={c.id}>
						{editing === c.id ? (
							<CarrierForm
								carrier={c}
								onDone={() => setEditing(null)}
							/>
						) : (
							<CarrierRow
								canManage={canManage}
								carrier={c}
								onEdit={() => setEditing(c.id)}
							/>
						)}
					</li>
				))}
			</ul>
			{!canManage ? null : editing === 'new' ? (
				<div className="rounded-md border p-4">
					<CarrierForm onDone={() => setEditing(null)} />
				</div>
			) : (
				<Button
					className="self-start"
					disabled={full}
					onClick={() => setEditing('new')}
					type="button"
				>
					<Plus />
					Add a carrier
				</Button>
			)}
			{canManage && full && (
				<p className="text-muted-foreground text-xs">
					You can save up to {formatLimit(CARRIERS_MAX)} carriers.
				</p>
			)}
		</div>
	)
}

function CarrierRow({
	carrier: c,
	onEdit,
	canManage,
}: {
	carrier: Carrier
	onEdit: () => void
	/** Shows Edit and Delete: the driver manages this space. */
	canManage: boolean
}) {
	const queryClient = useQueryClient()
	const [confirming, setConfirming] = useState(false)
	const [pending, startTransition] = useTransition()

	const remove = () =>
		startTransition(async () => {
			const res = await deleteCarrier(c.id)
			if ('errorMessage' in res) {
				toast.error('Could not delete the carrier', {
					description: res.errorMessage,
				})
				return
			}
			await queryClient.invalidateQueries({ queryKey: CARRIERS_KEY })
			toast.success('Carrier deleted')
		})

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 items-start gap-3">
				<Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div className="min-w-0">
					<p className="break-words font-medium">{c.name}</p>
					<p className="break-words text-muted-foreground text-sm">
						{c.address}
					</p>
				</div>
			</div>
			<div className="flex shrink-0 gap-2">
				{!canManage ? null : confirming ? (
					<>
						<Button
							disabled={pending}
							onClick={remove}
							size="sm"
							type="button"
							variant="destructive"
						>
							<Trash2 />
							{pending ? 'Deleting…' : 'Delete'}
						</Button>
						<Button
							disabled={pending}
							onClick={() => setConfirming(false)}
							size="sm"
							type="button"
							variant="outline"
						>
							Keep
						</Button>
					</>
				) : (
					<>
						<Button
							aria-label={`Edit ${c.name}`}
							onClick={onEdit}
							size="sm"
							type="button"
							variant="outline"
						>
							<Pencil />
							Edit
						</Button>
						<Button
							aria-label={`Delete ${c.name}`}
							onClick={() => setConfirming(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<Trash2 />
							Delete
						</Button>
					</>
				)}
			</div>
		</div>
	)
}
