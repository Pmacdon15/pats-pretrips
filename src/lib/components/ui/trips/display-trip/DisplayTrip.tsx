'use client'
import { BackLink } from '../../links/back-home-button'

export default function DisplayTrip({
	tripTable,
	pageHead,
	addDefectForm,
}: {
	tripTable: React.ReactNode
	pageHead: React.ReactNode
	addDefectForm: React.ReactNode
}) {
	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<BackLink />

			{pageHead}

			{tripTable}

			{addDefectForm}
		</div>
	)
}
