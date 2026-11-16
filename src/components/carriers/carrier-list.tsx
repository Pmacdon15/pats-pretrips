'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Building2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
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
	// In an organization the saved entries are its sites, not carriers.
	const noun = inOrg ? 'sites' : 'carriers'

	return (
		<div className="flex flex-col gap-4">
			{inOrg && canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These sites are shared with everyone in your organization.
					As an admin, you can change them.
				</p>
			)}
			{!canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These are your organization&apos;s sites. Only its admins
					can add, change or delete them.
				</p>
			)}
			{carriers.length === 0 && editing !== 'new' && !canManage && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					Your organization has no saved sites yet.
				</p>
			)}
			{carriers.length === 0 && editing !== 'new' && canManage && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					{inOrg
						? 'No saved sites yet. Add your shops, yards and depots, then pick one when you start a pre-trip.'
						: 'No saved carriers yet. Add the companies you haul for, then pick one when you start a pre-trip.'}
				</p>
			)}
			<ul className="flex flex-col gap-3">
				{carriers.map((c) => (
					<li className="rounded-md border p-4" key={c.id}>
						{editing === c.id ? (
							<CarrierForm
								carrier={c}
								onDone={() => setEditing(null)}
								site={inOrg}
							/>
						) : (
							<CarrierRow
								canManage={canManage}
								carrier={c}
								onEdit={() => setEditing(c.id)}
								site={inOrg}
							/>
						)}
					</li>
				))}
			</ul>
			{!canManage ? null : editing === 'new' ? (
				<div className="rounded-md border p-4">
					<CarrierForm onDone={() => setEditing(null)} site={inOrg} />
				</div>
			) : (
				<Button
					className="self-start"
					disabled={full}
					onClick={() => setEditing('new')}
					type="button"
				>
					<Plus />
					{inOrg ? 'Add a site' : 'Add a carrier'}
				</Button>
			)}
			{canManage && full && (
				<p className="text-muted-foreground text-xs">
					You can save up to {formatLimit(CARRIERS_MAX)} {noun}.
				</p>
			)}
		</div>
	)
}

function CarrierRow({
	carrier: c,
	onEdit,
	canManage,
	site,
}: {
	carrier: Carrier
	onEdit: () => void
	/** Shows Edit and Delete: the driver manages this space. */
	canManage: boolean
	/** One of an organization's sites, not a carrier. */
	site: boolean
}) {
	const what = site ? 'site' : 'carrier'
	const Icon = site ? MapPin : Building2
	const queryClient = useQueryClient()
	const [confirming, setConfirming] = useState(false)
	const [pending, startTransition] = useTransition()

	const remove = () =>
		startTransition(async () => {
			const res = await deleteCarrier(c.id)
			if ('errorMessage' in res) {
				toast.error(`Could not delete the ${what}`, {
					description: res.errorMessage,
				})
				return
			}
			await queryClient.invalidateQueries({ queryKey: CARRIERS_KEY })
			toast.success(site ? 'Site deleted' : 'Carrier deleted')
		})

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 items-start gap-3">
				<Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
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
