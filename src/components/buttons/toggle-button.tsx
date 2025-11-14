import { Button } from '../ui/button'

export function ButtonToggle({
	text,
	toggleText,
	onClick,
	toggle,
}: {
	text: string
	toggleText: string
	onClick: () => void
	toggle: boolean
}) {
	return (
		<Button
			className={`rounded-lg p-4 ${toggle ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} shadow-lg`}
			onClick={onClick}
			size={'lg'}
			type="button"
			variant={'outline'}
		>
			{toggle ? toggleText : text}
		</Button>
	)
}
