'use client'
import { useRef, useState } from 'react'
import type { Control } from 'react-hook-form'
import type { z } from 'zod'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import type { schemaAddTripForm } from '@/lib/ZOD/schemas'
import { ControlledTextArea } from '../forms/controlled-text-area'

interface AddDefectProps {
	control: Control<z.infer<typeof schemaAddTripForm>>
}

const defects = [
	'Air Brake System',
	'Cab',
	'Cargo Securement',
	'Coupling Devices',
	'Dangerous Goods',
	'Driver Controls',
	'Driver Seat',
	'Safety Devices',
	'Exhaust System',
	'Frame',
	'Fuel System',
	'General',
	'Glass',
	'Mirrors',
	'Heater',
	'Horn',
	'Hydraulic System',
	'Steering',
	'Suspension',
	'Tires',
	'Rims',
	'Hubs',
	'Windows',
	'Wipers',
	'Kingpin',
	'Body',
	'Lights',
	'Reflectors',
	'Air Lines',
	'Other',
]

export function AddDefect({ control }: AddDefectProps) {
	const [selectedDefect, setSelectedDefect] = useState<string>('')
	const defectsRef = useRef<HTMLTextAreaElement>(null)

	const onDefectAdded = () => {
		if (selectedDefect && defectsRef.current) {
			const currentDefects = defectsRef.current.value
			if (!currentDefects.includes(selectedDefect)) {
				defectsRef.current.value = currentDefects
					? `${currentDefects}, ${selectedDefect}`
					: selectedDefect
			}
		}
	}
	return (
		<div className="flex flex-col w-full gap-4">
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
						onDefectAdded()
					}}
					text="Add Defect"
				/>
			</div>
			<div>
				<ControlledTextArea
					control={control}
					label="Defects"
					name="defects"
					readOnly
				/>
				<ControlledTextArea
					control={control}
					label="Remarks"
					name="remarks"					
				/>
			</div>
		</div>
	)
}

function ButtonNormal({
	text,
	onClick,
}: {
	text: string
	onClick: (e: React.MouseEvent) => void
}) {
	return (
		<button
			className={`rounded-lg bg-green-500 p-4 hover:bg-green-600`}
			onClick={onClick}
			type="button"
		>
			{text}
		</button>
	)
}
