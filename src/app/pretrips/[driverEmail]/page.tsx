import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips"
import AddTrip from "@/components/ui/trips/add-trip/addTrip"

export default async function Page({
    params,
}: {
    params: Promise<{ driverEmail: string }>
}) {
    const { driverEmail } = await params;
    const uriDecodedDriverEmail = decodeURIComponent(driverEmail);

    return (
        <div className="flex flex-col items-center justify-items-center min-h-screen gap-8 p-4  ">
            <AddTrip driverEmail={uriDecodedDriverEmail} />
            <DisplayTrips driverEmail={uriDecodedDriverEmail} />
        </div>
    )
}
