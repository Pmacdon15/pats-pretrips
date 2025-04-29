import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips"
import AddTrip from "@/components/ui/trips/add-trip/addTrip"
import Authbutton from "@/components/ui/auth-buttons/auth-buttons";
import { auth } from "@/auth";

export default async function Page({
    params,
}: {
    params: Promise<{ driverEmail: string }>
}) {
    const session = await auth();

    const { driverEmail } = await params;
    const uriDecodedDriverEmail = decodeURIComponent(driverEmail);

    return (
        <div className="flex flex-col items-center  justify-items-center min-h-screen gap-4 p-4  ">            
            <AddTrip driverEmail={uriDecodedDriverEmail} />
            <DisplayTrips driverEmail={uriDecodedDriverEmail} />
            <Authbutton session={session} />
        </div>
    )
}
