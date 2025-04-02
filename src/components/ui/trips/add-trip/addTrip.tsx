'use client'
import { useState, useRef } from "react";

const defects = [
    "Air Brake System",
    "Cab",
    "Cargo Securement",
    "Coupling Devices",
    "Dangerous Goods",
    "Driver Controls",
    "Driver Seat",
    "Safety Devices",
    "Exhaust System",
    "Frame",
    "Fuel System",
    "General",
    "Glass",
    "Mirrors",
    "Heater",
    "Horn",
    "Hydraulic System",
    "Steering",
    "Suspension",
    "Tires",
    "Rims",
    "Hubs",
    "Windows",
    "Wipers",
    "Kingpin",
    "Body",
    "Lights",
    "Reflectors",
    "Air Lines",
    "Other"
]
export default function AddTrip() {
    const [showForm, setShowForm] = useState(false);

    const defectSelectRef = useRef<HTMLSelectElement>(null);
    const defectsRef = useRef<HTMLTextAreaElement>(null);

    const onDefectAdded = () => {
        if (defectSelectRef.current?.value && defectsRef.current) {
            const currentDefects = defectsRef.current.value;
            const selectedDefect = defectSelectRef.current.value;

            if (!currentDefects.includes(selectedDefect)) {
                defectsRef.current.value = currentDefects ?
                    `${currentDefects}, ${selectedDefect}` :
                    selectedDefect;
            }
        }
    }

    return (
        <div className="flex flex-col md:flex-row w-full md:w-4/6 p-4 gap-8 border rounded-sm justify-between">
            <div className="flex flex-col w-full">
                <form className={`flex flex-col gap-4 w-full ${showForm ? 'block' : 'hidden'}`}>
                    <h1 className="text-2xl">Create a Trip</h1>
                    <div className='flex flex-col w-full gap-4'>
                        <Input required={true} name="carrier" placeHolder='Carrier' />
                        <Input required={true} name="carrier-address" placeHolder='Carrier Address' />
                        <Input required={true} name="inspection-address" placeHolder='Inspection Address' />
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
                    <div className="flex gap-8">
                        <select ref={defectSelectRef} className="border p-4 rounded-b-sm w-full [&>option]:bg-gradient-to-b from-[#1e3a8a] to-[#259feb]" name="input-defect">
                            <option className=" text-black" value="">Select Defect</option>
                            {defects.map((defect) =>
                                <option key={defect} value={defect} className="text-black">{defect}</option>
                            )}
                        </select>
                        <ButtonNormal text="Add Defect" onClick={(e) => {
                            e.preventDefault();
                            onDefectAdded();
                        }} />
                    </div>
                    <textarea ref={defectsRef} name='defects' placeholder="Defects" />
                </form>
            </div>
            <div className="flex flex-col justify-end">
                <Button text='Add Trip' toggleText="Cancel" onClick={() => setShowForm(!showForm)} toggle={showForm}></Button>
            </div>
        </div>
    )
}

function Button({ text, toggleText, onClick, toggle }: { text: string, toggleText: string, onClick: () => void, toggle: boolean }) {
    return (
        <button className={`border p-4 rounded-lg ${toggle ? 'bg-red-400 hover:bg-red-600' : 'bg-green-400  hover:bg-green-600'}`} onClick={onClick}>
            {toggle ? toggleText : text}
        </button>
    )
}

function ButtonNormal({ text, onClick, }: { text: string, onClick: (e: React.MouseEvent) => void }) {
    return (
        <button className={`border p-4 rounded-lg bg-green-400  hover:bg-green-600`} onClick={onClick}>
            {text}
        </button>
    )
}

function Input({ name, placeHolder, className, required }: { type?: string, name: string, placeHolder: string, className?: string, required?: boolean }) {
    return (
        <input required={required ? true : false} className={`border p-4 rounded-b-sm w-full ${className}`} type='text' name={name} placeholder={placeHolder} />
    )
}