'use server'

import {
	revalidateDriverTrailers,
	revalidateOrgTrailers,
} from '@/lib/cache/revalidate'
import {
	addTrailerDAL,
	deleteTrailerDAL,
	fetchTrailersDAL,
	updateTrailerDAL,
} from '../DAL/trailers'
import type { Trailer } from '../db/trailers'

/* The driver's saved trailers, from the web app. */

type TrailerAnswer = { value: Trailer } | { errorMessage: string }

export async function getTrailers() {
	return fetchTrailersDAL()
}

/** The saved trailer, clearing the space's cached list; or why not. */
function answer(
	result: Awaited<ReturnType<typeof addTrailerDAL>>,
): TrailerAnswer {
	return result.match(
		({ trailer, email, orgId }) => {
			if (orgId) revalidateOrgTrailers(orgId)
			else revalidateDriverTrailers(email)
			return { value: trailer }
		},
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function addTrailer(data: unknown) {
	return answer(await addTrailerDAL(data))
}

export async function updateTrailer(trailerId: number, data: unknown) {
	return answer(await updateTrailerDAL(trailerId, data))
}

export async function deleteTrailer(trailerId: number) {
	return answer(await deleteTrailerDAL(trailerId))
}
