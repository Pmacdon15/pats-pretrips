export default function DisplayTripsFallback() {
	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<div className="flex items-center justify-between">
				<h1 className="min-w-fit text-2xl">Current Trips</h1>
			</div>
			<h1>Loading ...</h1>
		</div>
	)
}
