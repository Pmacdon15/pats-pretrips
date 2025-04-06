'use client'
import { useState, useEffect } from "react";
import { AddDefect } from "@/components/ui/add-defect/AddDefect"
import Input from '@/components/ui/input/Input'
import { useAddTrip } from '@/hooks/mutations/mutations'
import { useGetAddress } from "@/hooks/hooks";
import { AddressResponse } from "@/types/types";

export default function AddTrip({ driverEmail }: { driverEmail: string }) {
    const [showForm, setShowForm] = useState(false);
    const { mutate } = useAddTrip(driverEmail);

    const { location } = useGetLocation();
    const { data } = useGetAddress(location?.latitude ?? 0, location?.longitude ?? 0, driverEmail) as { data: AddressResponse };
    
    console.log(data)
    return (
        <div className="flex flex-col md:flex-row w-full md:w-4/6 p-4 gap-4 border rounded-sm justify-between">
            <div className="flex flex-col w-full">
                <form
                    action={(formData: FormData) => { mutate({ driverEmail, formData }); setShowForm(false) }}
                    className={`flex flex-col gap-4 w-full ${showForm ? 'block' : 'hidden'}`}>
                    <h1 className="text-2xl">Create a Trip</h1>
                    <div className='flex flex-col w-full gap-4'>
                        <Input required={true} name="carrier" placeHolder='Carrier' />
                        <Input required={true} name="carrier-address" placeHolder='Carrier Address' />
                        <Input required={true} name="inspection-address" placeHolder='Inspection Address' defaultValue={data} />
                    </div>
                    <div className='flex w-full gap-4'>
                        <Input required={true} name="make" placeHolder='Make' />
                        <Input required={true} name="model" placeHolder='Model' />
                        <Input required={true} name="odometer" placeHolder='Odometer Reading' />
                    </div>
                    <div className='flex w-full gap-4'>
                        <Input name="truck-plate" placeHolder='Truck Plate' />
                        <Input name="trailer-plate" placeHolder='Trailer Plate' />
                        <Input name="trailer-b-plate" placeHolder='Trailer B Plate' />
                    </div>
                    <AddDefect requiered={false} />
                    <button className={`border p-4 rounded-lg bg-green-400  hover:bg-green-600`} >Submit</button>
                </form>
            </div>
            <div className="flex flex-col justify-end w-full md:w-1/6">
                <ButtonToggle text='Add Trip' toggleText="Cancel" onClick={() => setShowForm(!showForm)} toggle={showForm}></ButtonToggle>
            </div>
        </div>
    )
}

function ButtonToggle({ text, toggleText, onClick, toggle }: { text: string, toggleText: string, onClick: () => void, toggle: boolean }) {
    return (
        <button className={`border p-4 rounded-lg  ${toggle ? 'bg-red-400 hover:bg-red-600' : 'bg-green-400  hover:bg-green-600'}`} onClick={onClick}>
            {toggle ? toggleText : text}
        </button>
    )
}

function useGetLocation() {
    const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null)

    useEffect(() => {
        async function getLocation() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(async (position) => {

                    console.log(`Latitude: ${position?.coords.latitude}`);
                    console.log(`Longitude: ${position?.coords.longitude}`);
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    })
                });
            } else {
                console.log("Geolocation is not supported by this browser.");
            }
        }
        getLocation();
    }, []);


    return { location }
}