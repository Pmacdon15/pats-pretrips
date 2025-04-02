import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips"
import AddTrip from "@/components/ui/trips/add-trip/addTrip"

export default function Page() {
    return (
        <div className="flex flex-col items-center justify-items-center min-h-screen gap-8 p-4  sm:p-20 font-[family-name:var(--font-geist-sans)]">
            <AddTrip />
            <DisplayTrips tripTypeName="Current"  />
        </div>
    )
}
