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

export interface GeocodingResponse {
	results: GeocodingResult[]
	status: string
	error_message?: string
}
