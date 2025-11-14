import { neon } from '@neondatabase/serverless';
import { Trip } from '@/lib/types/types';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const driverEmail = pathSegments[pathSegments.length - 1];
    const tripId = pathSegments[pathSegments.length - 2];
    const uriDecodedDriverEmail = decodeURIComponent(driverEmail);
    try {
        const sql = neon(`${process.env.DATABASE_URL}`);
        const result = await sql`SELECT * FROM PTTrips WHERE tripId = ${tripId} AND driverEmail = ${uriDecodedDriverEmail}`;
        return new Response(JSON.stringify(result[0] as Trip), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(`Error getting comments: ${error}`, { headers: { 'Content-Type': 'text/plain' } });
    }
}

