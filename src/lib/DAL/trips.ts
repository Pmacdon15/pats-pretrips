import { Trip } from "@/lib/types/types";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { neon } from "@neondatabase/serverless";

export async function fetchCurrentTrips(  
  page: number = 1,
  limit: number = 7,
) {

  const {getUser} = getKindeServerSession();
  const user = await getUser();

  const email = user?.email

  if (!email) {
    throw new Error("Email is required");
  }

  try {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const offset = (page - 1) * limit;
    const result = await sql`
      SELECT * FROM PTTrips 
      WHERE driverEmail = ${email} 
      AND date >= NOW() - INTERVAL '24 hours' 
      ORDER BY date DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*) as count
      FROM PTTrips
      WHERE driverEmail = ${email}
      AND date >= NOW() - INTERVAL '24 hours'
    `;
    const totalTrips = countResult[0]?.count || 0;
    const hasMore = totalTrips > page * limit;

    return { trips: result as Trip[], hasMore };
  } catch (error) {
    console.error("Error fetching trips:", error);
    throw error;
  }
}

export async function fetchPastTrips(
  page: number = 1,
  limit: number = 7,
) {
  const {getUser} = getKindeServerSession();
  const user = await getUser();

  const email = user?.email
  
  if (!email) {
    throw new Error("Email is required");
  }

  try {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const offset = (page - 1) * limit;

    // Fetch the current page of trips
    const result = await sql`
      SELECT *
      FROM PTTrips
      WHERE driverEmail = ${email}
      AND date < NOW() - INTERVAL '24 hours'
      ORDER BY date DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Check if there are more trips beyond the current page
    const countResult = await sql`
      SELECT COUNT(*) as count
      FROM PTTrips
      WHERE driverEmail = ${email}
      AND date < NOW() - INTERVAL '24 hours'
    `;
    const totalTrips = countResult[0]?.count || 0;
    const hasMore = totalTrips > page * limit;

    return { trips: result as Trip[], hasMore };
  } catch (error) {
    console.error("error:", error);
    throw Error;
  }
}
