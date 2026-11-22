'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { Label } from '@/components/ui/label'
import type { Carrier } from '@/lib/db/carriers'
import { useCarriers } from '@/lib/hooks/hooks'
import { useSpace } from '@/lib/hooks/space'

/**
 * Picks one of the space's saved carriers on a new pre-trip; `onPick` fills
 * the form from it, which the driver can still edit. In an organization's
 * space these are the organization's carriers, shared by every member.
 */
export function CarrierPicker({
	onPick,
}: {
	onPick: (carrier: Carrier) => void
}) {
	const { data: carriers = [], isPending } = useCarriers()
	const { inOrg, canManage } = useSpace()
	const [picked, setPicked] = useState('')
	const id = useId()

	if (isPending) return null

	if (carriers.length === 0) {
		if (inOrg && !canManage) return null
		return (
			<p className="text-muted-foreground text-xs">
				{inOrg ? (
					<>
						Your drivers haul for the same companies?{' '}
						<Link className="underline" href="/carriers">
							Save your organization's carriers
						</Link>{' '}
						to fill these in with a tap.
					</>
				) : (
					<>
						Haul for the same companies often?{' '}
						<Link className="underline" href="/carriers">
							Save your carriers
						</Link>{' '}
						to fill these in with a tap.
					</>
				)}
			</p>
		)
	}

	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>Saved carrier</Label>
			<select
				className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
				id={id}
				onChange={(e) => {
					setPicked(e.target.value)
					const carrier = carriers.find(
						(c) => String(c.id) === e.target.value,
					)
					if (carrier) onPick(carrier)
				}}
				value={picked}
			>
				<option value="">Choose a carrier…</option>
				{carriers.map((c) => (
					<option key={c.id} value={c.id}>
						{c.name} — {c.address}
					</option>
				))}
			</select>
			<p className="text-muted-foreground text-xs">
				Fills in the carrier and its address.{' '}
				{(!inOrg || canManage) && (
					<Link className="underline" href="/carriers">
						Manage carriers
					</Link>
				)}
			</p>
		</div>
	)
}
