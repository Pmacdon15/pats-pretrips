import GoHomeButton from '../go-home-button/GoHomeButton'

export function Disclaimer({ text, name }: { text: string; name: string }) {
	return (
		<div className="flex flex-col items-center justify-items-center gap-8 p-4">
			<div className="flex w-5/6 flex-col items-center justify-center gap-4 rounded-md bg-[var(--color-primary)] p-8 shadow-md md:w-3/6">
				<h1> {name} </h1>
				<p className="rounded-sm bg-[var(--color-background)] p-8 indent-8 text-sm shadow-md">
					{text}
				</p>
				<GoHomeButton />
			</div>
		</div>
	)
}
