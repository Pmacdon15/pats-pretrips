'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Activity } from 'react'

interface PaginationProps {
	hasMorePastTrips: boolean | undefined
}

export function Pagination({ hasMorePastTrips }: PaginationProps) {
	const searchParams = useSearchParams()
	const router = useRouter()
	const page = searchParams.get('page') || '1'
	const currentPage = parseInt(page, 10)

	const handlePageChange = (newPage: number) => {
		const params = new URLSearchParams(searchParams)
		params.set('page', newPage.toString())
		router.push(`?${params.toString()}`)
	}

	return (
		<div className="mt-4 grid grid-cols-3 items-center">
			<div className="col-span-1">
				<Activity mode={currentPage !== 1 ? 'visible' : 'hidden'}>
					<button
						disabled={currentPage === 1}
						onClick={() => handlePageChange(currentPage - 1)}
						type="button"
					>
						Previous Page
					</button>
				</Activity>
			</div>
			<span className="flex justify-center">Page {currentPage}</span>

			<Activity mode={hasMorePastTrips ? 'visible' : 'hidden'}>
				<button
					disabled={!hasMorePastTrips}
					onClick={() => handlePageChange(currentPage + 1)}
					type="button"
				>
					Next Page
				</button>
			</Activity>
		</div>
	)
}
