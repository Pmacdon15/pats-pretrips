import DisplayTrips from "@/components/ui/trips/display-trips/DisplayTrips";
import AddTrip from "@/components/ui/trips/add-trip/addTrip";
import { fetchCurrentTrips, fetchPastTrips} from "@/lib/DAL/trips";
import TripsTable from "@/components/ui/trips/display-trips/trips-table";
import { Suspense } from "react";

export default function Page(){
    const currentTripsPromise = fetchCurrentTrips()
     const pastTripsPromise = fetchPastTrips()
    return (
        <div className="flex flex-col items-center justify-items-center gap-4 p-4  ">            
            <AddTrip />
            <Suspense>
            <DisplayTrips 
                currentTripsComponent={
                    <TripsTable tripsPromise={currentTripsPromise} />
                } 
                pastTripsComponent={
                    <TripsTable tripsPromise={pastTripsPromise}/>
                }            
            />        
            </Suspense>   
        </div>
    )
}
