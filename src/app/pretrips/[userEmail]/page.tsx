import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips"
import AddTrip from "@/components/ui/trips/add-trip/addTrip"

export default function Page() {
    return (
        <div className="flex flex-col items-center justify-items-center min-h-screen gap-8 p-8  ">
            <AddTrip />
            <DisplayTrips driverEmail="patrick@patmac.ca"  />
        </div>
    )
}
