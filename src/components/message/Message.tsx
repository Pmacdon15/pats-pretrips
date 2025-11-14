import { BackLink } from '../links/back-home-button'

export default function Message({
	message,
	driverEmail,
}: {
	message: string
	driverEmail?: string
}) {
	return (
		<div className="w-full gap-8 rounded-sm bg-[var(--color-primary)] p-8 md:w-4/6">
			{driverEmail && (
				<div className="my-4">
					<BackLink />
				</div>
			)}
			<h1 className="text-2xl">{message}</h1>
		</div>
	)
}
