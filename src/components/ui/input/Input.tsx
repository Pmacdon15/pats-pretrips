import type { AddressResponse } from '@/lib/types/types'

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
	defaultValue?: AddressResponse
}) {
	const address = defaultValue?.data?.features[0]?.properties
	return (
		<input
			className={`w-full rounded-sm border p-4 ${className}`}
			defaultValue={address ? `${address.formatted}` : ''}
			name={name}
			placeholder={placeHolder}
			required={!!required}
			type="text"
		/>
	)
}
