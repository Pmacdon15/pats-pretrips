'use client'

import { Eraser } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

/**
 * A box to sign in with a finger, stylus or mouse. Calls onChange with a PNG
 * data URL after each stroke, or null once cleared.
 */
export function SignaturePad({
	onChange,
	label = 'Signature',
}: {
	onChange: (dataUrl: string | null) => void
	label?: string
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const drawing = useRef(false)
	const drawn = useRef(false)

	useEffect(() => {
		// The ref is set before effects run.
		const canvas = canvasRef.current as HTMLCanvasElement
		const ratio = window.devicePixelRatio || 1
		const { width, height } = canvas.getBoundingClientRect()
		canvas.width = Math.max(1, Math.round(width * ratio))
		canvas.height = Math.max(1, Math.round(height * ratio))
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		ctx.scale(ratio, ratio)
		ctx.lineWidth = 2.2
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'
		ctx.strokeStyle = '#0f172a'
	}, [])

	const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		return { x: e.clientX - rect.left, y: e.clientY - rect.top }
	}

	const clear = () => {
		const canvas = canvasRef.current
		const ctx = canvas?.getContext('2d')
		if (!canvas || !ctx) return
		ctx.save()
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.restore()
		drawn.current = false
		onChange(null)
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm">{label}</span>
				<Button onClick={clear} size="sm" type="button" variant="ghost">
					<Eraser />
					Clear
				</Button>
			</div>
			<canvas
				aria-label={`${label} box. Sign with your finger or mouse.`}
				className="h-36 w-full touch-none rounded-md border border-input border-dashed bg-white"
				onPointerDown={(e) => {
					const ctx = e.currentTarget.getContext('2d')
					if (!ctx) return
					e.currentTarget.setPointerCapture(e.pointerId)
					drawing.current = true
					const { x, y } = point(e)
					ctx.beginPath()
					ctx.moveTo(x, y)
					ctx.lineTo(x + 0.1, y + 0.1)
					ctx.stroke()
				}}
				onPointerMove={(e) => {
					const ctx = drawing.current
						? e.currentTarget.getContext('2d')
						: null
					if (!ctx) return
					const { x, y } = point(e)
					ctx.lineTo(x, y)
					ctx.stroke()
					drawn.current = true
				}}
				onPointerUp={(e) => {
					if (!drawing.current) return
					drawing.current = false
					if (drawn.current) {
						onChange(e.currentTarget.toDataURL('image/png'))
					}
				}}
				ref={canvasRef}
				role="img"
			/>
			<p className="text-muted-foreground text-xs">
				The mechanic signs here to confirm the repair.
			</p>
		</div>
	)
}
