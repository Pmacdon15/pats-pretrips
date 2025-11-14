import { Trip } from "@/types/types";
import { neon } from "@neondatabase/serverless";

export async function fetchCurrentTrips(email: string | null | undefined) {
  if (!email) {
    throw new Error("Email is required");
  }

  try {
     const sql = neon(`${process.env.DATABASE_URL}`);
    const result = await sql`
      SELECT * FROM PTTrips 
      WHERE driverEmail = ${email} 
      AND date >= NOW() - INTERVAL '24 hours' 
      ORDER BY date DESC
    `;
    return result as Trip[];
  } catch (error) {
    console.error("Error fetching trips:", error);
    throw error;
  }
}