import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	updateTag: vi.fn(),
	addTripDAL: vi.fn(),
	addOnRouteDefectsDAL: vi.fn(),
	prepareAutoEmailDAL: vi.fn(),
	after: vi.fn(),
	rateLimit: vi.fn(),
}))
vi.mock('@/lib/rate-limit', async (original) => ({
	...(await original<typeof import('@/lib/rate-limit')>()),
	rateLimit: mocks.rateLimit,
}))

// Stands in for Clerk's current user: `getUser` gives the user or null.
vi.mock('@/lib/auth', () => ({
	getDriverEmail: async () =>
		((await mocks.getUser()) as { email?: string } | null)?.email ?? null,
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/DAL/email', () => ({
	prepareAutoEmailDAL: mocks.prepareAutoEmailDAL,
}))
vi.mock('@/lib/DAL/inserts', () => ({
	addTripDAL: mocks.addTripDAL,
	addOnRouteDefectsDAL: mocks.addOnRouteDefectsDAL,
}))

import { addOnRouteDefects, addTrip, getAddress } from '@/lib/actions/actions'

const fetchMock = vi.fn()

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	mocks.prepareAutoEmailDAL.mockResolvedValue(null)
	mocks.rateLimit.mockResolvedValue({ ok: true })
	vi.stubGlobal('fetch', fetchMock)
	vi.stubEnv('REVERSE_GEOCODING_API_KEY', 'key123')
	for (const level of ['log', 'warn', 'error'] as const) {
		vi.spyOn(console, level).mockImplementation(() => {})
	}
})

const defects = { defects: 'Horn', remarks: 'Loud', trip_id: 3 }
const form = {
	carrier: 'Acme',
	carrierAddress: '1 Main St',
	inspectionAddress: '123 North St',
	make: 'Volvo',
	model: 'VNL',
	odometer: 1000,
	defects: '',
	remarks: 'All good',
	signature: 'saved',
}

describe('addOnRouteDefects', () => {
	it('returns the trip and refreshes its cache tags', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(
			okAsync({ tripid: 3, driveremail: 'pat@x.com' }),
		)

		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			value: { tripid: 3, driveremail: 'pat@x.com' },
		})
		expect(mocks.updateTag.mock.calls).toEqual([['trips:pat@x.com']])
	})

	it('returns the error reason', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(
			errAsync({ reason: 'Not authorized' }),
		)
		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			errorMessage: 'Not authorized',
		})
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})

	it('falls back to a generic message', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(errAsync({ reason: '' }))
		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			errorMessage: 'An unexpected error occurred',
		})
	})
})

describe('addTrip', () => {
	it("returns the trip and refreshes the driver's trips", async () => {
		const saved = { tripid: 1, driveremail: 'Pat@X.com' }
		mocks.addTripDAL.mockResolvedValue(okAsync(saved))

		await expect(addTrip(form)).resolves.toEqual({ value: saved })
		expect(mocks.updateTag.mock.calls).toEqual([['trips:pat@x.com']])
	})

	it('emails the new pre-trip after the response when auto-send is on', async () => {
		const send = vi.fn()
		mocks.prepareAutoEmailDAL.mockResolvedValue(send)
		mocks.addTripDAL.mockResolvedValue(
			okAsync({ tripid: 1, driveremail: 'pat@x.com' }),
		)

		await addTrip(form)
		expect(send).not.toHaveBeenCalled()
		mocks.after.mock.calls[0][0]()
		expect(send).toHaveBeenCalledWith({
			tripid: 1,
			driveremail: 'pat@x.com',
		})
	})

	it("doesn't email when auto-send is off or can't be checked", async () => {
		mocks.addTripDAL.mockResolvedValue(
			okAsync({ tripid: 1, driveremail: 'pat@x.com' }),
		)
		await addTrip(form)
		mocks.prepareAutoEmailDAL.mockRejectedValue(new Error('db down'))
		await expect(addTrip(form)).resolves.toEqual({
			value: { tripid: 1, driveremail: 'pat@x.com' },
		})
		expect(mocks.after).not.toHaveBeenCalled()
		expect(console.error).toHaveBeenCalled()
	})

	it('returns the error reason', async () => {
		mocks.addTripDAL.mockResolvedValue(errAsync({ reason: 'Db error' }))
		await expect(addTrip(form)).resolves.toEqual({
			errorMessage: 'Db error',
		})
		expect(mocks.prepareAutoEmailDAL).not.toHaveBeenCalled()
	})

	it('falls back to a generic message', async () => {
		mocks.addTripDAL.mockResolvedValue(errAsync({ reason: '' }))
		await expect(addTrip(form)).resolves.toEqual({
			errorMessage: 'An unexpected error occurred',
		})
	})
})

describe('getAddress', () => {
	const ok = (body: unknown) =>
		fetchMock.mockResolvedValue({ ok: true, json: async () => body })
	const place = { formatted_address: '1 Main St, Calgary' }
	// The driver's position, and what the logs must never show.
	const LAT = 51.04473
	const LNG = -114.07109
	const PRIVATE = ['51.04473', '114.07109', '1 Main St', 'key123']

	/** Everything written to the console, as one string. */
	const logged = () =>
		(['log', 'info', 'warn', 'error'] as const)
			.flatMap((level) => vi.mocked(console[level]).mock.calls.flat())
			.map(String)
			.join('\n')

	const expectNothingPrivateLogged = () => {
		for (const value of PRIVATE) expect(logged()).not.toContain(value)
	}

	beforeEach(() => {
		vi.spyOn(console, 'info').mockImplementation(() => {})
	})

	it('reverse-geocodes the coordinates with Google Maps', async () => {
		ok({ status: 'OK', results: [place] })

		await expect(getAddress(LAT, LNG)).resolves.toEqual({
			data: { status: 'OK', results: [place] },
		})
		expect(fetchMock).toHaveBeenCalledWith(
			'https://maps.googleapis.com/maps/api/geocode/json?latlng=51.0447%2C-114.0711&key=key123',
			{ cache: 'no-cache', signal: expect.any(AbortSignal) },
		)
		// A lookup that works logs nothing at all.
		expect(logged()).toBe('')
		expect(mocks.rateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'geocode' }),
			'pat@x.com',
		)
	})

	it.each([
		[51.04473, -114.07109, '51.0447%2C-114.0711'],
		[51.044749999, -114.071149999, '51.0447%2C-114.0711'],
		[51.12345678901234, 0.00004, '51.1235%2C0'],
		[-0.00001, 179.99999, '0%2C180'],
	])('rounds (%s, %s) to 4 decimals before asking Google', async (lat, lng, latlng) => {
		ok({ status: 'OK', results: [place] })
		await getAddress(lat, lng)
		expect(String(fetchMock.mock.calls[0][0])).toContain(
			`?latlng=${latlng}&`,
		)
	})

	it("sends nothing of Google's answer but the status and the best address", async () => {
		ok({
			status: 'OK',
			error_message: 'key123 at /geocode/json?latlng=1,2&key=key123',
			results: [
				{
					...place,
					place_id: 'abc',
					geometry: { location: { lat: LAT, lng: LNG } },
					address_components: [],
				},
				{ formatted_address: 'Calgary, AB' },
			],
			url: 'https://maps.googleapis.com/maps/api/geocode/json?key=key123',
		})
		const result = await getAddress(LAT, LNG)
		expect(result).toEqual({ data: { status: 'OK', results: [place] } })
		expect(JSON.stringify(result)).not.toContain('key123')
		expect(JSON.stringify(result)).not.toContain('51.04473')
	})

	it('gives up on Google after 5 seconds', async () => {
		// AbortSignal.timeout runs on Node's own timers, which fake timers
		// don't reach: check it's asked for 5 s, and hand back a real signal
		// that times out at once, so fetch fails the way it does in production.
		const realTimeout = AbortSignal.timeout.bind(AbortSignal)
		const timeout = vi
			.spyOn(AbortSignal, 'timeout')
			.mockImplementation(() => realTimeout(1))
		// A Google that never answers: only the signal ends the request.
		fetchMock.mockImplementation(
			(_url: string, init: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					init.signal.addEventListener('abort', () =>
						reject(init.signal.reason),
					)
				}),
		)
		try {
			await expect(getAddress(LAT, LNG)).resolves.toEqual({
				data: undefined,
			})
			expect(timeout).toHaveBeenCalledWith(5000)
			expect(fetchMock.mock.calls[0][1].signal).toBe(
				timeout.mock.results[0].value,
			)
			expect(vi.mocked(console.error).mock.calls).toEqual([
				['getAddress: Google did not answer within 5000 ms'],
			])
			expectNothingPrivateLogged()
		} finally {
			timeout.mockRestore()
		}
	})

	it('asks Google every time: nothing is cached on the server', async () => {
		ok({ status: 'OK', results: [place] })
		await getAddress(LAT, LNG)
		await getAddress(LAT, LNG)
		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(mocks.rateLimit).toHaveBeenCalledTimes(2)
	})

	it("doesn't call Google once the driver is over the limit", async () => {
		mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 900 })
		await expect(getAddress(51, -114)).resolves.toEqual({
			data: undefined,
			errorMessage:
				'Too many requests in a short time. Please wait about 15 minutes and try again.',
		})
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it.each([
		[91, 0],
		[0, -181],
		[Number.NaN, 0],
		['51&foo=bar' as unknown as number, 0],
	])('does not look up invalid coordinates (%s, %s)', async (lat, lng) => {
		await expect(getAddress(lat, lng)).resolves.toEqual({ data: undefined })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('returns an OK response with no results', async () => {
		ok({ status: 'OK', results: [] })
		await expect(getAddress(LAT, LNG)).resolves.toEqual({
			data: { status: 'OK', results: [] },
		})
		expect(console.warn).toHaveBeenCalledWith(
			'getAddress: Google returned OK with no results',
		)
		expectNothingPrivateLogged()
	})

	it.each([
		{ status: 'OK' },
		{ status: 'OK', results: [{}] },
		{ status: 'OK', results: [{ formatted_address: 7 }] },
	])('returns no address when Google gives none (%j)', async (body) => {
		ok(body)
		await expect(getAddress(1, 2)).resolves.toEqual({
			data: { status: 'OK', results: [] },
		})
	})

	it.each([
		'not a status: key123',
		42,
		undefined,
	])("replaces a status that isn't one of Google's codes (%s)", async (status) => {
		ok({ status, results: [place] })
		await expect(getAddress(1, 2)).resolves.toEqual({
			data: { status: 'UNKNOWN_ERROR', results: [] },
		})
	})

	it.each([
		{ status: 'REQUEST_DENIED', error_message: 'Bad key', results: [] },
		{ status: 'ZERO_RESULTS', results: [] },
	])('returns a non-OK status ($status) without results', async (body) => {
		ok(body)
		// Only the status: Google's error_message stays on the server.
		await expect(getAddress(LAT, LNG)).resolves.toEqual({
			data: { status: body.status, results: [] },
		})
		expect(console.error).toHaveBeenCalledWith(
			`getAddress: Google returned ${body.status}`,
			body.error_message ?? '',
		)
		expectNothingPrivateLogged()
	})

	it.each([
		`Invalid request. Invalid 'latlng' parameter: ${LAT},${LNG}`,
		`The provided API key key123 is invalid for latlng=${LAT}%2C${LNG}`,
		`Near ${LAT} ${LNG}`,
	])("keeps the key and position out of Google's message: %s", async (message) => {
		ok({ status: 'INVALID_REQUEST', error_message: message })
		const result = await getAddress(LAT, LNG)
		expect(result).toEqual({
			data: { status: 'INVALID_REQUEST', results: [] },
		})
		for (const value of PRIVATE) {
			expect(JSON.stringify(result)).not.toContain(value)
		}
		expect(console.error).toHaveBeenCalledWith(
			'getAddress: Google returned INVALID_REQUEST',
			expect.stringContaining('[position]'),
		)
		expectNothingPrivateLogged()
	})

	it('returns no data when the request fails, logging only the status', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Server Error',
			text: async () =>
				`<p>The requested URL /maps/api/geocode/json?latlng=${LAT},${LNG}&key=key123 failed</p>`,
		})
		await expect(getAddress(LAT, LNG)).resolves.toEqual({ data: undefined })
		expect(vi.mocked(console.error).mock.calls).toEqual([
			['getAddress: Google answered HTTP 500'],
		])
		expectNothingPrivateLogged()
	})

	it.each([
		new Error('offline'),
		'offline',
	])('returns no data when fetch throws %s', async (error) => {
		fetchMock.mockRejectedValue(error)
		await expect(getAddress(LAT, LNG)).resolves.toEqual({ data: undefined })
		expect(console.error).toHaveBeenCalledWith(
			'getAddress: the Google request failed:',
			'offline',
		)
	})

	it('keeps the key and position out of a failure that quotes the request', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => {
				throw new SyntaxError(
					`Unexpected token '<', "<a href=/geocode/json?latlng=${LAT},${LNG}&key=key123>" is not valid JSON`,
				)
			},
		})
		await expect(getAddress(LAT, LNG)).resolves.toEqual({ data: undefined })
		expect(console.error).toHaveBeenCalledWith(
			'getAddress: the Google request failed:',
			expect.stringContaining('latlng=[position]'),
		)
		expectNothingPrivateLogged()
	})

	it('returns no data without an API key', async () => {
		vi.stubEnv('REVERSE_GEOCODING_API_KEY', '')
		await expect(getAddress(LAT, LNG)).resolves.toEqual({ data: undefined })
		expect(fetchMock).not.toHaveBeenCalled()
		expect(console.error).toHaveBeenCalledWith(
			'getAddress: REVERSE_GEOCODING_API_KEY is not set',
		)
		expectNothingPrivateLogged()
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		await expect(getAddress(1, 2)).rejects.toThrow('Must be logged in')
	})
})
