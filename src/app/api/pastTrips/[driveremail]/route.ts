import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  
  const url = request.nextUrl;
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = Number(url.searchParams.get('limit')) || 4;  

  const pathSegments = url.pathname.split('/');
  const driverEmail = pathSegments[pathSegments.length - 1];
  const uriDecodedDriverEmail = decodeURIComponent(driverEmail);
  


  try {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const offset = (page - 1) * limit;   

    // Fetch the current page of trips
    const result = await sql`
      SELECT *
      FROM PTTrips
      WHERE driverEmail = ${uriDecodedDriverEmail}
      AND date >= NOW() - INTERVAL '24 hours'
      ORDER BY date DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `; 

    // Check if there are more trips beyond the current page
    const countResult = await sql`
      SELECT COUNT(*) as count
      FROM PTTrips
      WHERE driverEmail = ${uriDecodedDriverEmail}
    `;
    const totalTrips = countResult[0]?.count || 0;
    const hasMore = totalTrips > page * limit;    

    return NextResponse.json({ pastTrips: result, hasMore });
  } catch (error) {
    console.error('error:', error);
    return new NextResponse(`Error getting past trips: ${error}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}

