import { neon } from '@neondatabase/serverless';
import { Trip } from '@/types/types';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/');
    const driverEmail = pathSegments[pathSegments.length - 1];
    const uriDecodedDriverEmail = decodeURIComponent(driverEmail);
    try {
        const sql = neon(`${process.env.DATABASE_URL}`);
        const result = await sql`SELECT * FROM PTTrips WHERE driverEmail = ${uriDecodedDriverEmail} AND date >= CURRENT_DATE - INTERVAL '15 days' ORDER BY date`;
        return new Response(JSON.stringify(result as Trip[]), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        return new Response(`Error getting comments: ${error}`, { headers: { 'Content-Type': 'text/plain' } });
    }
}

