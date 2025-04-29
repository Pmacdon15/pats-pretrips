import Link from "next/link";

export default function GoHomeButton() {
    return (
        <Link 
            href='/' 
            className='flex items-center justify-center w-3/6 text-center bg-[var(--color-background)] p-4 rounded-sm shadow-lg transition-transform hover:scale-105 hover:shadow-xl'
        >
            Go Home
        </Link>
    );
};