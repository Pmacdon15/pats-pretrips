'use client'

import { useState } from 'react'
import { ButtonNormal } from '@/components/buttons/normal-button'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { defects } from '@/lib/utils-defects'

export function AddDefect({
	children,
	handleSelectDefect,
}: {
	children: React.ReactNode
	handleSelectDefect: (defect: string) => void
}) {
	const [selectedDefect, setSelectedDefect] = useState<string>('')

	return (
		<div className="flex w-full flex-col gap-4">
			<Select onValueChange={setSelectedDefect} value={selectedDefect}>
				<SelectTrigger className="w-5/6 rounded-sm border p-4 md:w-full">
					<SelectValue placeholder="Select Defect" />
				</SelectTrigger>
				<SelectContent>
					{defects.map((defect) => (
						<SelectItem key={defect} value={defect}>
							{defect}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="w-2/6 md:w-1/6">
				<ButtonNormal
					onClick={(e) => {
						e.preventDefault()
						handleSelectDefect(selectedDefect)
					}}
					text="Add Defect"
				/>
			</div>
			<div>{children}</div>
		</div>
	)
}
