import type { Control, FieldValues, Path } from 'react-hook-form'

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
}

export interface AddressResponse {
	features: {
		properties: {
			housenumber: string
			street: string
			country_code: string
			county: string
			state_code: string
			formatted: string
		}
	}[]
}

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

export interface ControlledTextAreaProps<T extends FieldValues> {
	control: Control<T>
	name: Path<T>
	label: string
	placeholder?: string
	readOnly?: boolean
}

export interface FormData {
	defects: string
	remarks: string
}
