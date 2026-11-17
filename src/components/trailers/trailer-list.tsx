'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Container, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteTrailer } from '@/lib/actions/trailers'
import type { Trailer } from '@/lib/db/trailers'
import { TRAILERS_KEY, useTrailers } from '@/lib/hooks/hooks'
import { useSpace } from '@/lib/hooks/space'
import { formatLimit, TRAILERS_MAX } from '@/lib/trip-limits'
import { TrailerForm } from './trailer-form'

/**
 * The space's saved trailers (the driver's own, or their organization's):
 * add one, edit one or delete one, when the driver manages the space. Pick
 * one on a new pre-trip to fill in a trailer plate.
 */
export function TrailerList() {
	const { data: trailers = [], isPending } = useTrailers()
	const { inOrg, canManage } = useSpace()
	// 'new' while adding, a trailer's id while editing it.
	const [editing, setEditing] = useState<'new' | number | null>(null)

	if (isPending) {
		return <div className="h-24 animate-pulse rounded-md bg-muted" />
	}

	const full = trailers.length >= TRAILERS_MAX

	return (
		<div className="flex flex-col gap-4">
			{inOrg && canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These trailers are shared with everyone in your
					organization. As an admin, you can change them.
				</p>
			)}
			{!canManage && (
				<p className="rounded-md bg-muted p-3 text-muted-foreground text-sm">
					These are your organization&apos;s trailers. Only its admins
					can add, change or delete them.
				</p>
			)}
			{trailers.length === 0 && editing !== 'new' && (
				<p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
					{canManage
						? 'No saved trailers yet. Add the trailers you pull, then pick them when you start a pre-trip.'
						: 'Your organization has no saved trailers yet.'}
				</p>
			)}
			<ul className="flex flex-col gap-3">
				{trailers.map((t) => (
					<li className="rounded-md border p-4" key={t.id}>
						{editing === t.id ? (
							<TrailerForm
								onDone={() => setEditing(null)}
								trailer={t}
							/>
						) : (
							<TrailerRow
								canManage={canManage}
								onEdit={() => setEditing(t.id)}
								trailer={t}
							/>
						)}
					</li>
				))}
			</ul>
			{!canManage ? null : editing === 'new' ? (
				<div className="rounded-md border p-4">
					<TrailerForm onDone={() => setEditing(null)} />
				</div>
			) : (
				<Button
					className="self-start"
					disabled={full}
					onClick={() => setEditing('new')}
					type="button"
				>
					<Plus />
					Add a trailer
				</Button>
			)}
			{canManage && full && (
				<p className="text-muted-foreground text-xs">
					You can save up to {formatLimit(TRAILERS_MAX)} trailers.
				</p>
			)}
		</div>
	)
}

function TrailerRow({
	trailer: t,
	onEdit,
	canManage,
}: {
	trailer: Trailer
	onEdit: () => void
	/** Shows Edit and Delete: the driver manages this space. */
	canManage: boolean
}) {
	const queryClient = useQueryClient()
	const [confirming, setConfirming] = useState(false)
	const [pending, startTransition] = useTransition()
	const title = t.name || t.plate

	const remove = () =>
		startTransition(async () => {
			const res = await deleteTrailer(t.id)
			if ('errorMessage' in res) {
				toast.error('Could not delete the trailer', {
					description: res.errorMessage,
				})
				return
			}
			await queryClient.invalidateQueries({ queryKey: TRAILERS_KEY })
			toast.success('Trailer deleted')
		})

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 items-start gap-3">
				<Container className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div className="min-w-0">
					<p className="break-words font-medium">{title}</p>
					{t.name && (
						<p className="break-words text-muted-foreground text-sm">
							Plate {t.plate}
						</p>
					)}
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
							aria-label={`Edit ${title}`}
							onClick={onEdit}
							size="sm"
							type="button"
							variant="outline"
						>
							<Pencil />
							Edit
						</Button>
						<Button
							aria-label={`Delete ${title}`}
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
