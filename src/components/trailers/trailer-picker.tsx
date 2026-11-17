'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { Label } from '@/components/ui/label'
import type { Trailer } from '@/lib/db/trailers'
import { useTrailers } from '@/lib/hooks/hooks'
import { useSpace } from '@/lib/hooks/space'

/**
 * Suggests saving trailers while the space has none, so their plates can be
 * picked with a tap. Shows nothing while they load, once some are saved, or
 * to an organization's drivers, who can't save them.
 */
export function SaveTrailersHint() {
	const { data: trailers = [], isPending } = useTrailers()
	const { inOrg, canManage } = useSpace()
	if (isPending || trailers.length > 0 || (inOrg && !canManage)) return null
	return (
		<p className="text-muted-foreground text-xs">
			Pull the same trailers often?{' '}
			<Link className="underline" href="/vehicles#trailers">
				Save your trailers
			</Link>{' '}
			to pick their plates with a tap.
		</p>
	)
}

/**
 * Picks one of the space's saved trailers for one trailer slot on a new
 * pre-trip; `onPick` fills that slot's plate, which the driver can still
 * edit. Until the space has saved trailers it shows nothing.
 */
export function TrailerPicker({
	label,
	onPick,
}: {
	label: string
	onPick: (trailer: Trailer) => void
}) {
	const { data: trailers = [], isPending } = useTrailers()
	const [picked, setPicked] = useState('')
	const id = useId()

	if (isPending || trailers.length === 0) return null

	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<select
				className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
				id={id}
				onChange={(e) => {
					setPicked(e.target.value)
					const trailer = trailers.find(
						(t) => String(t.id) === e.target.value,
					)
					if (trailer) onPick(trailer)
				}}
				value={picked}
			>
				<option value="">Choose a trailer…</option>
				{trailers.map((t) => (
					<option key={t.id} value={t.id}>
						{trailerLabel(t)}
					</option>
				))}
			</select>
		</div>
	)
}

/** A trailer as the picker lists it: its name and plate, or just the plate. */
export function trailerLabel(t: Pick<Trailer, 'name' | 'plate'>) {
	return t.name ? `${t.name} · ${t.plate}` : t.plate
}
