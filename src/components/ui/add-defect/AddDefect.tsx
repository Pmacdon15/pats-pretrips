'use client'
import { useRef } from 'react'

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

export function AddDefect({ required }: { required: boolean }) {
	const defectSelectRef = useRef<HTMLSelectElement>(null)
	const defectsRef = useRef<HTMLTextAreaElement>(null)

	const onDefectAdded = () => {
		if (defectSelectRef.current?.value && defectsRef.current) {
			const currentDefects = defectsRef.current.value
			const selectedDefect = defectSelectRef.current.value

			if (!currentDefects.includes(selectedDefect)) {
				defectsRef.current.value = currentDefects
					? `${currentDefects}, ${selectedDefect}`
					: selectedDefect
			}
		}
	}
	return (
		<>
			<div className="flex w-full gap-4">
				<select
					className="w-5/6 rounded-sm border p-4 md:w-full"
					name="input-defect"
					ref={defectSelectRef}
				>
					<option className="text-black" value="">
						Select Defect
					</option>
					{defects.map((defect) => (
						<option
							className="text-black"
							key={defect}
							value={defect}
						>
							{defect}
						</option>
					))}
				</select>
				<div className="w-2/6 md:w-1/6">
					<ButtonNormal
						onClick={(e) => {
							e.preventDefault()
							onDefectAdded()
						}}
						text="Add Defect"
					/>
				</div>
			</div>
			<textarea
				className="rounded-sm border p-4"
				name="defects"
				placeholder="Defects to Submit"
				readOnly={true}
				ref={defectsRef}
				required={required}
			/>
			<textarea
				className="rounded-sm border p-4"
				name="remarks"
				placeholder="Remarks"
				required={required}
			/>
		</>
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
