'use client'
import { useRef } from "react";

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

export function AddDefect({ requiered }: { requiered: boolean }) {
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
        <>
            <div className="flex gap-4 w-full">
                <select
                    ref={defectSelectRef}
                    className="border p-4 rounded-sm w-5/6 md:w-full [&>option]:bg-gradient-to-b from-[#1e3a8a] to-[#259feb]"
                    name="input-defect"
                >
                    <option className=" text-black" value="">Select Defect</option>
                    {defects.map((defect) =>
                        <option key={defect} value={defect} className="text-black">{defect}</option>
                    )}
                </select>
                <div className="w-2/6 md:w-1/6">
                    <ButtonNormal text="Add Defect" onClick={(e) => {
                        e.preventDefault();
                        onDefectAdded();
                    }} />
                </div>
            </div>
            <textarea required={requiered}  className="border rounded-sm p-4" readOnly={true} ref={defectsRef} name='defects' placeholder="Defects to Submit" />
            <textarea required={requiered} className="border rounded-sm p-4" name='remarks' placeholder="Remarks" />
        </>
    )
}

function ButtonNormal({ text, onClick, }: { text: string, onClick: (e: React.MouseEvent) => void }) {
    return (
        <button className={`border p-4 rounded-lg bg-green-400  hover:bg-green-600`} onClick={onClick}>
            {text}
        </button>
    )
}