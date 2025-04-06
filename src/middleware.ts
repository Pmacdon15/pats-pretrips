import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const protectedRoutes = ['/api/trip', '/pretrips', 'pretrip'];

export default async function middleware(request: NextRequest) {
    const session = await auth();
    const { pathname } = request.nextUrl;

    const isProtected = protectedRoutes.some((route) =>
        pathname.startsWith(route)
    );

    if (isProtected && !session) {
        return NextResponse.redirect(new URL('/api/auth/signin', request.url));
    }

    if (isProtected && session?.user?.email && !pathname.includes(session.user.email)) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}