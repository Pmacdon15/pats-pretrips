'use cache: private'
import DisplayTrip from "@/components/ui/trips/display-trip/DisplayTrip";

export default async function Page({
    params,
}: {
    params: Promise<{ tripId: number }>
}) {
   
    const driverName = "pmacdonald15@gmail.com"

    const { tripId  } = await params;
    const uriDecodedDriverEmail = "pmacdonald15@gmail.com"

    if (isNaN(Number(tripId))) return (<div>Trip Id Error</div>)

    return (
        <div className="flex flex-col items-center justify-items-center gap-4 p-4  ">
            <DisplayTrip tripId={tripId} driverEmail={uriDecodedDriverEmail} driverName={driverName || ''} />
           
        </div>
    )
}