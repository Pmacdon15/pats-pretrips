import type { Trip } from '@/lib/types/types'

/** A complete trip; override only what a test cares about. */
export const trip = (over: Partial<Trip> = {}): Trip => ({
	tripid: 1,
	driveremail: 'pat@x.com',
	carrier: 'Acme',
	carrieraddress: '1 Main St',
	inspectionaddress: '123 North St',
	make: 'Volvo',
	model: 'VNL',
	odometer: 1000,
	truckplate: 'TRK1',
	trailerplatea: 'TRL1',
	trailerplateb: 'TRL2',
	date: new Date('2026-01-02T03:04:00Z'),
	defects: 'Cab',
	remarks: 'Cracked',
	...over,
})
