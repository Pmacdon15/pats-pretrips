import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips";
import AddTrip from "@/components/ui/trips/add-trip/addTrip";
import { fetchTrips} from "@/lib/DAL/trips";


export default function Page(props: PageProps<'/pretrips/[driverEmail]'>){
    // const session = await auth();

    // const { driverEmail } = await params;
    // const uriDecodedDriverEmail = decodeURIComponent(driverEmail);

    	const currentTripsPromise = props.params.then((params) =>
		fetchTrips(decodeURIComponent(params.driverEmail)),
	)
    return (
        <div className="flex flex-col items-center justify-items-center gap-4 p-4  ">            
            <AddTrip driverEmail={"pmacdonald15@gmail.com"} />
            <DisplayTrips  />
           
        </div>
    )
}
