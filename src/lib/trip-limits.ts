/*
 * How long a trip's fields can be, shared by the web form's schemas
 * (src/lib/ZOD/schemas.ts), the AI connector's (src/mcp/tools.ts) and the
 * database writes (src/lib/db/trips.ts), so the three can't drift apart.
 * The column sizes are the database's own (src/lib/sql/makeDb.sql).
 */

/** A limit as written in messages: "2,000" for 2000. */
export const formatLimit = (value: number) => value.toLocaleString('en-US')

/** carrier VARCHAR(255) */
export const CARRIER_MAX = 255
/** carrierAddress and inspectionAddress VARCHAR(255) */
export const ADDRESS_MAX = 255
/** make and model VARCHAR(100) */
export const MAKE_MODEL_MAX = 100
/** truckPlate, trailerPlateA and trailerPlateB VARCHAR(20) */
export const PLATE_MAX = 20
/** odometer INT: whole kilometres, well past any truck's lifetime. */
export const ODOMETER_MAX = 10_000_000

/** Remarks written at once: on a new trip, or added on route. */
export const REMARKS_MAX = 2000
/** Defects added at once, and the length of each one's name. */
export const DEFECT_COUNT_MAX = 30
export const DEFECT_NAME_MAX = 60
/**
 * The web form sends defects as one comma separated string: at most
 * DEFECT_COUNT_MAX names of DEFECT_NAME_MAX characters, joined by ", ".
 */
export const DEFECTS_TEXT_MAX =
	DEFECT_COUNT_MAX * DEFECT_NAME_MAX + (DEFECT_COUNT_MAX - 1) * 2

/*
 * A trip's stored defects and remarks only grow: on-route defects and
 * remarks are appended to them (src/lib/db/trips.ts updateTripDb). These cap
 * the total, so repeated appends can't make a trip's pages, PDF or email
 * arbitrarily large. A driver adds a handful of on-route notes in the 24
 * hours a trip can be changed; these leave room for a full new trip plus
 * several more full-length additions.
 */

/**
 * A trip's whole defect list: every category of the app's list is 324
 * characters, and one connector call's most (30 names of 60) is 1,858.
 */
export const STORED_DEFECTS_MAX = 2000
/**
 * A trip's whole remarks: full-length first remarks plus three full-length
 * additions (8,006 characters with the ", " between them), or dozens of
 * ordinary notes.
 */
export const STORED_REMARKS_MAX = 10_000

/** A saved vehicle's name (pt_vehicles.name VARCHAR(100)), e.g. "Unit 42". */
export const VEHICLE_NAME_MAX = 100
/** Most vehicles one driver can save. */
export const VEHICLES_MAX = 50

/** Most carriers one driver can save. */
export const CARRIERS_MAX = 50
