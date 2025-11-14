import DisplayTripFallback from '@/lib/components/ui/fallbacks/display-trip-falback'

export default function Loading() {
	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4">
			<DisplayTripFallback />
		</div>
	)
}
