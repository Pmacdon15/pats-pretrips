/** Where the app serves a repair's invoice or signature. */
export function repairFilePath(
	repairId: number,
	kind: 'invoice' | 'signature',
) {
	return `/api/repairs/${repairId}/${kind}`
}
