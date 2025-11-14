import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips";
import AddTrip from "@/components/ui/trips/add-trip/addTrip";
import { fetchCurrentTrips} from "@/lib/DAL/trips";

import TripsTable from "@/components/ui/trips/display-trips/trips-table";


export default function Page(props: PageProps<'/pretrips/[driverEmail]'>){

    const currentTripsPromise = props.params.then((params) =>
		fetchCurrentTrips(decodeURIComponent(params.driverEmail)),
	)

     const pastTripsPromise = props.params.then((params) =>
		fetchCurrentTrips(decodeURIComponent(params.driverEmail)),
	)


    return (
        <div className="flex flex-col items-center justify-items-center gap-4 p-4  ">            
            <AddTrip driverEmail={"pmacdonald15@gmail.com"} />
            <DisplayTrips 
                currentTripsComponent={
                    <TripsTable tripsPromise={currentTripsPromise} driverEmailPromise={props.params.then((params) => decodeURIComponent(params.driverEmail))}/>
                } 
                pastTripsComponent={
                    <TripsTable tripsPromise={pastTripsPromise} driverEmailPromise={props.params.then((params) => decodeURIComponent(params.driverEmail))}/>
                }            
            />
           
        </div>
    )
}
