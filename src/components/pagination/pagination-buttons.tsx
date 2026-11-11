'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface PaginationProps {
	hasMore: boolean | undefined
	/** Search param that stores the page number for this list. */
	param: string
}

export function Pagination({ hasMore, param }: PaginationProps) {
	const searchParams = useSearchParams()
	const router = useRouter()
	const currentPage = Math.max(1, Number(searchParams.get(param)) || 1)

	if (currentPage === 1 && !hasMore) return null

	const handlePageChange = (newPage: number) => {
		const params = new URLSearchParams(searchParams)
		if (newPage <= 1) params.delete(param)
		else params.set(param, newPage.toString())
		const query = params.toString()
		router.push((query ? `?${query}` : '?') as Route, { scroll: false })
	}

	return (
		<div className="flex items-center justify-between gap-2 border-t px-5 py-3 sm:px-6">
			<Button
				disabled={currentPage === 1}
				onClick={() => handlePageChange(currentPage - 1)}
				size="sm"
				variant="outline"
			>
				<ChevronLeft />
				Previous
			</Button>
			<span className="text-muted-foreground text-sm">
				Page {currentPage}
			</span>
			<Button
				disabled={!hasMore}
				onClick={() => handlePageChange(currentPage + 1)}
				size="sm"
				variant="outline"
			>
				Next
				<ChevronRight />
			</Button>
		</div>
	)
}
