export const defects = [
	'Air Brake System',
	'Cab',
	'Cargo Securement',
	'Coupling Devices',
	'Dangerous Goods',
	'Driver Controls',
	'Driver Seat',
	'Safety Devices',
	'Exhaust System',
	'Frame',
	'Fuel System',
	'General',
	'Glass',
	'Mirrors',
	'Heater',
	'Horn',
	'Hydraulic System',
	'Steering',
	'Suspension',
	'Tires',
	'Rims',
	'Hubs',
	'Windows',
	'Wipers',
	'Kingpin',
	'Body',
	'Lights',
	'Reflectors',
	'Air Lines',
	'Other',
]

/** Split a comma separated defects string into a clean list. */
export function parseDefects(value: string | null | undefined): string[] {
	if (!value) return []
	return value
		.split(',')
		.map((d) => d.trim())
		.filter((d) => d !== '' && d.toLowerCase() !== 'none')
}

export function joinDefects(list: string[]): string {
	return list.join(', ')
}
