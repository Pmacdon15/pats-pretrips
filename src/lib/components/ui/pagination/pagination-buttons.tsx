'use client'
import { useRouter, useSearchParams } from 'next/navigation'

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
		<div className="mt-4 flex items-center justify-between">
			<button
				disabled={currentPage === 1}
				onClick={() => handlePageChange(currentPage - 1)}
				type="button"
			>
				Previous Page
			</button>
			<span>Page {currentPage}</span>
			<button
				disabled={!hasMorePastTrips}
				onClick={() => handlePageChange(currentPage + 1)}
				type="button"
			>
				Next Page
			</button>
		</div>
	)
}
