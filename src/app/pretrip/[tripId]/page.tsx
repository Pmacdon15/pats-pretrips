
import DisplayTrip from "@/components/ui/trips/display-trip/DisplayTrip";

export default async function Page({
    params,
}: {
    params: Promise<{ tripId: number, driverEmail: string }>
}) {
   
    const driverName = "pmacdonald15@gmail.com"

    const { tripId, driverEmail } = await params;
    const uriDecodedDriverEmail = decodeURIComponent(driverEmail);

    if (isNaN(Number(tripId))) return (<div>Trip Id Error</div>)

    return (
        <div className="flex flex-col items-center justify-items-center gap-4 p-4  ">
            <DisplayTrip tripId={tripId} driverEmail={uriDecodedDriverEmail} driverName={driverName || ''} />
           
        </div>
    )
}