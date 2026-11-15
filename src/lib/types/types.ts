export interface Trip {
	tripid?: number
	driveremail: string
	carrier: string
	carrieraddress: string
	inspectionaddress: string
	make: string
	model: string
	odometer: number
	truckplate?: string
	trailerplatea?: string
	trailerplateb?: string
	date: Date
	defects: string
	remarks: string
	/** When the driver signed the trip; null or missing when unsigned. */
	signed_at?: Date | string | null
	/** Set on optimistic trips that have not been saved yet. */
	pending?: boolean
}

export interface TripsResponse {
	trips: Trip[]
	hasMore: boolean
}

export type TripsAction =
	| { type: 'ADD'; payload: Trip }
	| { type: 'REMOVE'; payload: number }
	| { type: 'UPDATE'; payload: Trip }

export interface AddressComponent {
	long_name?: string
	short_name?: string
	types: string[]
}

export interface GeocodingResult {
	address_components: AddressComponent[]
	formatted_address: string
	geometry: {
		location: {
			lat: number
			lng: number
		}
		location_type: string
		viewport: {
			northeast: {
				lat: number
				lng: number
			}
			southwest: {
				lat: number
				lng: number
			}
		}
	}
	place_id: string
	plus_code?: {
		compound_code: string
		global_code: string
	}
	types: string[]
}

/** Google's Geocoding API answer, as the server receives it. */
export interface GeocodingResponse {
	results: GeocodingResult[]
	status: string
	error_message?: string
}

/**
 * What `getAddress` sends to the browser: Google's status and, when there is
 * one, the best address. Nothing else from Google's answer (in particular
 * not `error_message`, which is Google's own text and could quote the
 * request) leaves the server.
 */
export interface AddressLookup {
	status: string
	results: { formatted_address: string }[]
}
