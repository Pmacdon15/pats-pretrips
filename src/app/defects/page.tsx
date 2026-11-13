import { Suspense } from 'react'
import { BackLink } from '@/components/links/back-home-button'
import { DefectRecordView } from '@/components/repairs/defect-record'
import { fetchDefectRecord } from '@/lib/DAL/repairs'

export const metadata = { title: "Defects & repairs · Pat's PreTrips" }

export default function Page() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
			<BackLink />
			<h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
				Defects &amp; repairs
			</h1>
			<Suspense
				fallback={
					<div className="flex flex-col gap-6">
						<div className="h-48 animate-pulse rounded-xl bg-muted" />
						<div className="h-48 animate-pulse rounded-xl bg-muted" />
					</div>
				}
			>
				<DefectRecordView recordPromise={fetchDefectRecord()} />
			</Suspense>
		</div>
	)
}
