import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	updateTag: vi.fn(),
	fetchTrailersDAL: vi.fn(),
	addTrailerDAL: vi.fn(),
	updateTrailerDAL: vi.fn(),
	deleteTrailerDAL: vi.fn(),
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('@/lib/DAL/trailers', () => ({
	fetchTrailersDAL: mocks.fetchTrailersDAL,
	addTrailerDAL: mocks.addTrailerDAL,
	updateTrailerDAL: mocks.updateTrailerDAL,
	deleteTrailerDAL: mocks.deleteTrailerDAL,
}))

import {
	addTrailer,
	deleteTrailer,
	getTrailers,
	updateTrailer,
} from '@/lib/actions/trailers'

const row = { id: 5, name: 'Flatdeck', plate: 'TR 123' }
const saved = okAsync({ trailer: row, email: 'Pat@x.com', orgId: null })

beforeEach(() => {
	mocks.fetchTrailersDAL.mockResolvedValue([row])
})

describe('trailer actions', () => {
	it('lists the trailers', async () => {
		await expect(getTrailers()).resolves.toEqual([row])
	})

	it.each([
		[
			'addTrailer',
			mocks.addTrailerDAL,
			() => addTrailer({ name: 'Flatdeck' }),
		],
		['updateTrailer', mocks.updateTrailerDAL, () => updateTrailer(3, {})],
		['deleteTrailer', mocks.deleteTrailerDAL, () => deleteTrailer(3)],
	])('%s answers the trailer and clears the cached list', async (_n, dal, call) => {
		dal.mockReturnValue(saved)
		await expect(call()).resolves.toEqual({ value: row })
		expect(mocks.updateTag).toHaveBeenCalledWith('trailers:pat@x.com')
	})

	it("clears an organization's list, not the driver's, for a change in it", async () => {
		mocks.addTrailerDAL.mockReturnValue(
			okAsync({ trailer: row, email: 'Pat@x.com', orgId: 'org_1' }),
		)
		await expect(addTrailer({})).resolves.toEqual({ value: row })
		expect(mocks.updateTag.mock.calls).toEqual([['org-trailers:org_1']])
	})

	it('answers why not, clearing nothing', async () => {
		mocks.addTrailerDAL.mockReturnValue(errAsync({ reason: 'Nope' }))
		await expect(addTrailer({})).resolves.toEqual({ errorMessage: 'Nope' })
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})

	it('passes the id and fields on', async () => {
		mocks.updateTrailerDAL.mockReturnValue(saved)
		mocks.deleteTrailerDAL.mockReturnValue(saved)
		await updateTrailer(3, { name: 'X' })
		await deleteTrailer(4)
		expect(mocks.updateTrailerDAL).toHaveBeenCalledWith(3, { name: 'X' })
		expect(mocks.deleteTrailerDAL).toHaveBeenCalledWith(4)
	})
})
