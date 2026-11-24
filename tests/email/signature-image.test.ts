// @vitest-environment node
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { signatureOnWhite } from '@/lib/email/signature-image'

describe('signatureOnWhite', () => {
	it('puts a transparent signature on solid white, with a margin', async () => {
		// Dark ink in the middle of a transparent 20x10 image.
		const ink = await sharp({
			create: {
				width: 20,
				height: 10,
				channels: 4,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			},
		})
			.composite([
				{
					input: {
						create: {
							width: 4,
							height: 2,
							channels: 4,
							background: { r: 10, g: 20, b: 60, alpha: 1 },
						},
					},
					left: 8,
					top: 4,
				},
			])
			.png()
			.toBuffer()

		const out = await signatureOnWhite(ink)
		const { data, info } = await sharp(out)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true })
		expect(info.width).toBe(52)
		expect(info.height).toBe(42)
		const px = (x: number, y: number) =>
			Array.from(
				data.subarray(
					(y * info.width + x) * 4,
					(y * info.width + x) * 4 + 4,
				),
			)
		// Formerly transparent, now opaque white.
		expect(px(0, 0)).toEqual([255, 255, 255, 255])
		expect(px(17, 17)).toEqual([255, 255, 255, 255])
		// The ink is still there.
		expect(px(25, 21)).toEqual([10, 20, 60, 255])
	})

	it('hands back bytes it cannot read as they were', async () => {
		const bad = Buffer.from('not a png')
		expect(await signatureOnWhite(bad)).toBe(bad)
	})
})
