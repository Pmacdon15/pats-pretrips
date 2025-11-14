'use client'
export function ButtonNormal({
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
