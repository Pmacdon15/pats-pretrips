import { AddressResponse } from "@/lib/types/types";

export default function Input({
    name,
    placeHolder,
    className,
    required,
    defaultValue,
}: {
    type?: string;
    name: string;
    placeHolder: string;
    className?: string;
    required?: boolean;
    defaultValue?: AddressResponse;

}) {
    const address = defaultValue?.data?.features[0]?.properties
    return (
        <input
            required={required ? true : false}
            className={`border p-4 rounded-sm w-full ${className}`}
            type='text'
            name={name}
            placeholder={placeHolder}
            defaultValue={address ? `${address.formatted}` : ''}
        />
    )
}
