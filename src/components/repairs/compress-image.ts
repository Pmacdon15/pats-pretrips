/*
 * Shrinks an invoice photo in the browser before it's uploaded, so a 10 MB
 * phone photo goes up as a few hundred KB. PDFs go up as they are (the
 * server rewrites them smaller). The server compresses everything again.
 */

const MAX_PX = 2000
/** Server actions accept 5 MB; leave room for the rest of the form. */
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024

export async function shrinkInvoice(file: File): Promise<File> {
	if (!file.type.startsWith('image/')) return file
	try {
		const bitmap = await createImageBitmap(file)
		const scale = Math.min(
			1,
			MAX_PX / Math.max(bitmap.width, bitmap.height),
		)
		const canvas = document.createElement('canvas')
		canvas.width = Math.round(bitmap.width * scale)
		canvas.height = Math.round(bitmap.height * scale)
		const ctx = canvas.getContext('2d')
		if (!ctx) return file
		ctx.fillStyle = '#fff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
		bitmap.close()
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.8),
		)
		if (!blob || blob.size >= file.size) return file
		const name = `${file.name.replace(/\.[^.]*$/, '') || 'invoice'}.jpg`
		return new File([blob], name, { type: 'image/jpeg' })
	} catch {
		// The browser can't decode it (e.g. HEIC outside Safari): the server tries.
		return file
	}
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
