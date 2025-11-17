'use server'

import { updateTag } from 'next/cache'

export async function updateTagAction(tagToUpdate: string) {
	updateTag(tagToUpdate)
}
