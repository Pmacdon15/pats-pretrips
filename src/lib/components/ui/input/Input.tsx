export default function Input({
	name,
	placeHolder,
	className,
	required,
	defaultValue,
}: {
	type?: string
	name: string
	placeHolder: string
	className?: string
	required?: boolean
	defaultValue?: string
}) {
	return (
		<input
			className={`w-full rounded-sm border p-4 ${className}`}
			defaultValue={defaultValue}
			name={name}
			placeholder={placeHolder}
			required={!!required}
			type="text"
		/>
	)
}
