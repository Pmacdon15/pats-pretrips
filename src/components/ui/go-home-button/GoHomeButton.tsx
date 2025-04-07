import Link from "next/link";

export default function GoHomeButton() {
    return (
        <Link href='/' className='flex items-center justify-center w-3/6 text-center border p-4 rounded-sm shadow-lg'>
            Go Home
        </Link>
    );
};