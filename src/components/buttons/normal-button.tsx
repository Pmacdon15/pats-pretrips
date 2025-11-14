'use client'

import { Button } from '../ui/button'

export function ButtonNormal({
	text,
	onClick,
}: {
	text: string
	onClick: (e: React.MouseEvent) => void
}) {
	return (
		<Button
			className={`rounded-lg bg-green-500 p-4 hover:bg-green-600`}
			onClick={onClick}
			size={'lg'}
			type="button"
		>
			{text}
		</Button>
	)
}
