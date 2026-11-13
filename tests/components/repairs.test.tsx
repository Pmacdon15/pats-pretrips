import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	formatBytes,
	MAX_UPLOAD_BYTES,
	shrinkInvoice,
} from '@/components/repairs/compress-image'
import { DefectRecordView } from '@/components/repairs/defect-record'
import { DefectStatusList } from '@/components/repairs/defect-status-list'
import { repairDate } from '@/components/repairs/repair-summary'
import { SignaturePad } from '@/components/repairs/signature-pad'
import { TripDefects } from '@/components/trips/display-trip/displayTripTable'
import type { DefectRecord } from '@/lib/repairs/status'
import { repair, trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	markDefectRepaired: vi.fn(),
	undoDefectRepair: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/repairs', () => ({
	markDefectRepaired: mocks.markDefectRepaired,
	undoDefectRepair: mocks.undoDefectRepair,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

/** jsdom has no canvas: a 2D context that records nothing. */
function fakeCanvas(ctx: object | null = makeCtx()) {
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
		ctx as never,
	)
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
		'data:image/png;base64,aGk=',
	)
}
function makeCtx() {
	const fn = () => vi.fn()
	return {
		scale: fn(),
		beginPath: fn(),
		moveTo: fn(),
		lineTo: fn(),
		stroke: fn(),
		save: fn(),
		restore: fn(),
		setTransform: fn(),
		clearRect: fn(),
		fillRect: fn(),
		drawImage: fn(),
	}
}

/** Draws one stroke in the signature box. */
function sign() {
	const box = screen.getByRole('img', { name: /signature box/i })
	fireEvent.pointerDown(box, { clientX: 5, clientY: 5, pointerId: 1 })
	fireEvent.pointerMove(box, { clientX: 20, clientY: 15, pointerId: 1 })
	fireEvent.pointerUp(box, { pointerId: 1 })
}

beforeEach(() => {
	HTMLCanvasElement.prototype.setPointerCapture ??= () => {}
	fakeCanvas()
	mocks.markDefectRepaired.mockResolvedValue({ value: repair() })
	mocks.undoDefectRepair.mockResolvedValue({ value: { id: 7 } })
})

describe('DefectStatusList', () => {
	it('shows each defect open or repaired', () => {
		render(
			<DefectStatusList
				defects="Cab, Horn"
				repairs={[repair()]}
				tripId={1}
			/>,
		)
		expect(
			screen.getByText('1 of 2 defects still open.'),
		).toBeInTheDocument()
		expect(screen.getByText('Repaired')).toBeInTheDocument()
		expect(screen.getByText('Open')).toBeInTheDocument()
		expect(
			screen.getByText('Sam Wrench, Highway Truck'),
		).toBeInTheDocument()
		expect(screen.getByText('INV-1')).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'View invoice' }),
		).toHaveAttribute('href', '/api/repairs/7/invoice')
		expect(
			screen.getByRole('img', {
				name: 'Signature of Sam Wrench, Highway Truck',
			}),
		).toHaveAttribute('src', '/api/repairs/7/signature')
		expect(
			screen.getAllByRole('button', { name: /Mark repaired/ }),
		).toHaveLength(1)
	})

	it('says when everything is repaired, and shows nothing without defects', () => {
		const { rerender, container } = render(
			<DefectStatusList defects="Cab" repairs={[repair()]} tripId={1} />,
		)
		expect(
			screen.getByText('Every defect on this trip has been repaired.'),
		).toBeInTheDocument()
		rerender(<DefectStatusList defects="Cab" repairs={[]} tripId={1} />)
		expect(
			screen.getByText('1 of 1 defect still open.'),
		).toBeInTheDocument()
		rerender(<DefectStatusList defects="" repairs={[]} tripId={1} />)
		expect(container).toBeEmptyDOMElement()
	})

	it('marks a defect repaired with the signature and invoice', async () => {
		const user = userEvent.setup()
		render(<DefectStatusList defects="Horn" repairs={[]} tripId={3} />)
		await user.click(screen.getByRole('button', { name: /Mark repaired/ }))
		const form = screen.getByRole('form', { name: 'Repair Horn' })
		expect(form).toBeInTheDocument()

		await user.type(screen.getByLabelText('Mechanic'), 'Sam Wrench')
		await user.type(screen.getByLabelText('Shop'), 'Shop')
		await user.type(screen.getByLabelText('Invoice number'), 'INV-9')
		await user.type(screen.getByLabelText('Notes (optional)'), 'New horn')
		fireEvent.change(screen.getByLabelText('Repaired on'), {
			target: { value: '2026-01-04' },
		})
		const pdf = new File(['%PDF-1.7'], 'bill.pdf', {
			type: 'application/pdf',
		})
		await user.upload(screen.getByLabelText('Invoice (photo or PDF)'), pdf)
		await screen.findByText('8 B')
		sign()

		await user.click(screen.getByRole('button', { name: 'Mark repaired' }))
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith(
				'Horn marked repaired',
			),
		)
		const sent: FormData = mocks.markDefectRepaired.mock.calls[0][0]
		expect(Object.fromEntries(sent)).toMatchObject({
			tripId: '3',
			defect: 'Horn',
			mechanicName: 'Sam Wrench',
			shopName: 'Shop',
			invoiceNumber: 'INV-9',
			repairedOn: '2026-01-04',
			notes: 'New horn',
			signature: 'data:image/png;base64,aGk=',
		})
		expect((sent.get('invoice') as File).name).toBe('bill.pdf')
		// The form closes once saved.
		expect(screen.queryByRole('form')).toBeNull()
	})

	it('needs a name and a signature, and shows a failed save', async () => {
		const user = userEvent.setup()
		render(<DefectStatusList defects="Horn" repairs={[]} tripId={3} />)
		await user.click(screen.getByRole('button', { name: /Mark repaired/ }))
		const submit = screen.getByRole('button', { name: 'Mark repaired' })

		await user.click(submit)
		expect(mocks.toast.error).toHaveBeenLastCalledWith(
			'Add the mechanic or the shop that repaired it',
		)
		// The shop alone is enough.
		await user.type(screen.getByLabelText('Shop'), 'Highway Truck')
		await user.click(submit)
		expect(mocks.toast.error).toHaveBeenLastCalledWith(
			'Sign in the box to confirm the repair',
		)
		expect(mocks.markDefectRepaired).not.toHaveBeenCalled()

		sign()
		mocks.markDefectRepaired.mockResolvedValueOnce({ errorMessage: 'Nope' })
		await user.click(submit)
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenLastCalledWith(
				'Could not save the repair',
				{ description: 'Nope' },
			),
		)
		expect(screen.getByRole('form')).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(screen.queryByRole('form')).toBeNull()
	})

	it('compresses an invoice photo and refuses one too large', async () => {
		const user = userEvent.setup()
		const bitmap = { width: 4000, height: 3000, close: vi.fn() }
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => bitmap),
		)
		vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
			(cb) => cb(new Blob(['small'], { type: 'image/jpeg' })),
		)
		render(<DefectStatusList defects="Horn" repairs={[]} tripId={3} />)
		await user.click(screen.getByRole('button', { name: /Mark repaired/ }))
		const input = screen.getByLabelText('Invoice (photo or PDF)')

		await user.upload(
			input,
			new File(['x'.repeat(5000)], 'photo.png', { type: 'image/png' }),
		)
		await screen.findByText('Compressed 5 KB → 5 B')

		const huge = new File(['x'], 'huge.pdf', { type: 'application/pdf' })
		Object.defineProperty(huge, 'size', { value: MAX_UPLOAD_BYTES + 1 })
		await user.upload(input, huge)
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith(
				'Invoice too large',
				{
					description: expect.stringContaining('4.5 MB'),
				},
			),
		)
		expect(
			screen.getByText('Photos are compressed before upload.'),
		).toBeInTheDocument()

		fireEvent.change(input, { target: { files: [] } })
		expect(
			screen.getByText('Photos are compressed before upload.'),
		).toBeInTheDocument()
	})

	it('undoes a repair once confirmed', async () => {
		const user = userEvent.setup()
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(
			<DefectStatusList defects="Cab" repairs={[repair()]} tripId={1} />,
		)
		const undo = screen.getByRole('button', { name: /Undo repair/ })

		await user.click(undo)
		expect(mocks.undoDefectRepair).not.toHaveBeenCalled()

		confirm.mockReturnValue(true)
		await user.click(undo)
		await waitFor(() =>
			expect(mocks.toast.success).toHaveBeenCalledWith(
				'Cab is open again',
			),
		)
		expect(mocks.undoDefectRepair).toHaveBeenCalledWith(7)

		mocks.undoDefectRepair.mockResolvedValueOnce({ errorMessage: 'Gone' })
		await user.click(undo)
		await waitFor(() =>
			expect(mocks.toast.error).toHaveBeenCalledWith('Could not undo', {
				description: 'Gone',
			}),
		)
	})

	it('shows a repair without files, notes or a shop', () => {
		render(
			<DefectStatusList
				defects="Cab, Horn"
				repairs={[
					repair({
						shop_name: null,
						invoice_number: null,
						has_invoice: false,
						has_signature: false,
						notes: 'Replaced\nbulb',
						source: 'AI: Claude',
					}),
					repair({
						id: 8,
						defect: 'Horn',
						mechanic_name: null,
						has_signature: false,
					}),
				]}
				tripId={1}
			/>,
		)
		expect(screen.getByText('Sam Wrench')).toBeInTheDocument()
		expect(screen.getByText(/Replaced/)).toBeInTheDocument()
		expect(
			screen.getByText('No signature (recorded by AI: Claude)'),
		).toBeInTheDocument()
		expect(screen.getByText('No signature')).toBeInTheDocument()
		// Only the shop is known.
		expect(screen.getByText('Highway Truck')).toBeInTheDocument()
	})
})

describe('SignaturePad', () => {
	it('reports the drawing, and null once cleared', async () => {
		const onChange = vi.fn()
		render(<SignaturePad onChange={onChange} />)
		const box = screen.getByRole('img', { name: /Signature box/ })

		// A tap with no movement isn't a signature; moving without pressing draws nothing.
		fireEvent.pointerMove(box, { clientX: 1, clientY: 1 })
		fireEvent.pointerDown(box, { clientX: 1, clientY: 1, pointerId: 1 })
		fireEvent.pointerUp(box, { pointerId: 1 })
		fireEvent.pointerUp(box, { pointerId: 1 })
		expect(onChange).not.toHaveBeenCalled()

		sign()
		expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,aGk=')
		await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
		expect(onChange).toHaveBeenLastCalledWith(null)
	})

	it('does nothing without a 2D context', async () => {
		fakeCanvas(null)
		const onChange = vi.fn()
		render(<SignaturePad label="Sign" onChange={onChange} />)
		const box = screen.getByRole('img', { name: /Sign box/ })
		fireEvent.pointerDown(box, { clientX: 1, clientY: 1, pointerId: 1 })
		fireEvent.pointerMove(box, { clientX: 2, clientY: 2 })
		await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
		expect(onChange).not.toHaveBeenCalled()
	})

	it('draws on a high-density screen', () => {
		vi.stubGlobal('devicePixelRatio', 0)
		render(<SignaturePad onChange={() => {}} />)
		const box = screen.getByRole('img') as HTMLCanvasElement
		expect(box.width).toBe(1)
	})
})

describe('shrinkInvoice', () => {
	it('keeps PDFs, and photos it cannot shrink or decode', async () => {
		const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })
		expect(await shrinkInvoice(pdf)).toBe(pdf)

		const photo = new File(['x'], 'a.heic', { type: 'image/heic' })
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => {
				throw new Error('cannot decode')
			}),
		)
		expect(await shrinkInvoice(photo)).toBe(photo)

		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })),
		)
		vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
			(cb) => cb(null),
		)
		expect(await shrinkInvoice(photo)).toBe(photo)

		fakeCanvas(null)
		expect(await shrinkInvoice(photo)).toBe(photo)
	})

	it('names the JPEG after the photo', async () => {
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })),
		)
		vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
			(cb) => cb(new Blob(['a'])),
		)
		const out = await shrinkInvoice(
			new File(['abcdef'], '.png', { type: 'image/png' }),
		)
		expect(out.name).toBe('invoice.jpg')
		expect(out.type).toBe('image/jpeg')
	})

	it('formats sizes', () => {
		expect(formatBytes(500)).toBe('500 B')
		expect(formatBytes(2048)).toBe('2 KB')
		expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
	})
})

describe('repairDate', () => {
	it('shows the day as saved', () => {
		expect(repairDate('2026-01-05')).toBe('Jan 5, 2026')
	})
})

describe('TripDefects', () => {
	it('shows repaired defects as repaired', () => {
		render(
			<TripDefects
				repairs={[repair({ defect: 'cab' })]}
				trip={trip({ defects: 'Cab, Horn' })}
			/>,
		)
		expect(screen.getByText('(repaired)')).toBeInTheDocument()
		expect(screen.getAllByRole('listitem')).toHaveLength(2)
	})
})

describe('DefectRecordView', () => {
	const show = async (record: DefectRecord) => {
		await act(async () => {
			render(
				<Suspense>
					<DefectRecordView recordPromise={Promise.resolve(record)} />
				</Suspense>,
			)
		})
	}

	it('lists open defects and repaired ones', async () => {
		await show({
			open: [
				{
					trip_id: 2,
					trip_date: '2026-01-02T03:04:00.000Z',
					truck_plate: 'TRK1',
					make: 'Volvo',
					model: 'VNL',
					defect: 'Horn',
				},
			],
			repaired: [
				{
					...repair(),
					trip_date: '2026-01-02T03:04:00.000Z',
					truck_plate: null,
					make: 'Volvo',
					model: 'VNL',
				},
			],
		})
		expect(screen.getByText('1 open · 1 repaired')).toBeInTheDocument()
		expect(screen.getByRole('link', { name: /Horn/ })).toHaveAttribute(
			'href',
			'/pretrip/2#repairs',
		)
		expect(screen.getByText(/Volvo VNL · TRK1/)).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: /Found on trip 1/ }),
		).toHaveAttribute('href', '/pretrip/1#repairs')
	})

	it('says when there is nothing to show', async () => {
		await show({ open: [], repaired: [] })
		expect(screen.getByText('No open defects')).toBeInTheDocument()
		expect(screen.getByText('No repairs recorded yet.')).toBeInTheDocument()
	})
})
