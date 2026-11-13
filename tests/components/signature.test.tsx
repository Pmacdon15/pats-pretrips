import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DriverSignatureField } from '@/components/signature/driver-signature-field'
import { SignatureSettings } from '@/components/signature/signature-settings'
import { TripSignature } from '@/components/signature/trip-signature'
import { trip } from '../helpers/fixtures'
import { queryWrapper } from '../helpers/query'

const mocks = vi.hoisted(() => ({
	getSignatureStatus: vi.fn(),
	saveSignature: vi.fn(),
	deleteSignature: vi.fn(),
	signTrip: vi.fn(),
	toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/signatures', () => ({
	getSignatureStatus: mocks.getSignatureStatus,
	saveSignature: mocks.saveSignature,
	deleteSignature: mocks.deleteSignature,
	signTrip: mocks.signTrip,
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const WHEN = '2026-01-01T00:00:00.000Z'
const SAVED = { saved: true, updatedAt: WHEN }
const NONE = { saved: false, updatedAt: null }
const DRAWN = 'data:image/png;base64,aGk='

beforeEach(() => {
	vi.useFakeTimers({
		now: new Date('2026-01-02T12:00:00Z'),
		shouldAdvanceTime: true,
	})
	mocks.getSignatureStatus.mockResolvedValue(SAVED)
	mocks.saveSignature.mockResolvedValue({ value: SAVED })
	mocks.deleteSignature.mockResolvedValue({ value: NONE })
	mocks.signTrip.mockResolvedValue({ value: trip() })
	HTMLCanvasElement.prototype.setPointerCapture ??= () => {}
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
		scale: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		stroke: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		setTransform: vi.fn(),
		clearRect: vi.fn(),
	} as never)
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(DRAWN)
})

const renderQ = (ui: React.ReactElement) =>
	render(ui, { wrapper: queryWrapper() })

/** Draws one stroke in the signature box. */
function sign() {
	const box = screen.getByRole('img', { name: /box\. Sign with/ })
	fireEvent.pointerDown(box, { clientX: 5, clientY: 5, pointerId: 1 })
	fireEvent.pointerMove(box, { clientX: 20, clientY: 15, pointerId: 1 })
	fireEvent.pointerUp(box, { pointerId: 1 })
}

describe('DriverSignatureField', () => {
	function Field({ initial = '' }: { initial?: string }) {
		const [value, setValue] = useState(initial)
		const [save, setSave] = useState(true)
		return (
			<>
				<DriverSignatureField
					error="Sign the pre-trip"
					onChange={setValue}
					onSaveChange={setSave}
					save={save}
					value={value}
				/>
				<output data-testid="value">{value}</output>
				<output data-testid="save">{String(save)}</output>
			</>
		)
	}

	it('signs with the saved signature once it loads', async () => {
		renderQ(<Field />)
		expect(
			await screen.findByRole('img', { name: 'Your saved signature' }),
		).toBeInTheDocument()
		expect(screen.getByTestId('value')).toHaveTextContent('saved')
		expect(screen.getByRole('alert')).toHaveTextContent('Sign the pre-trip')
	})

	it('drops "saved" when the driver has no saved signature', async () => {
		mocks.getSignatureStatus.mockResolvedValue(NONE)
		renderQ(<Field initial="saved" />)
		await act(async () => {})
		expect(screen.getByTestId('value')).toBeEmptyDOMElement()
		sign()
		expect(screen.getByTestId('value')).toHaveTextContent(DRAWN)
		await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
		expect(screen.getByTestId('value')).toBeEmptyDOMElement()
		await userEvent.click(screen.getByLabelText(/Save my signature/))
		expect(screen.getByTestId('save')).toHaveTextContent('false')
	})
})

describe('TripSignature', () => {
	it("shows a signed trip's signature", async () => {
		renderQ(
			<TripSignature
				editable
				trip={trip({ signed_at: new Date('2026-01-02T03:05:00Z') })}
			/>,
		)
		expect(
			screen.getByRole('img', { name: 'Driver signature' }),
		).toHaveAttribute('src', '/api/trips/1/signature')
		expect(screen.getByText(/Signed by the driver/)).toBeInTheDocument()
	})

	it('says an old trip was not signed', () => {
		renderQ(<TripSignature editable={false} trip={trip()} />)
		expect(
			screen.getByText('This pre-trip was not signed.'),
		).toBeInTheDocument()
	})

	it('signs a recent trip with the saved signature', async () => {
		const user = userEvent.setup()
		renderQ(<TripSignature editable trip={trip()} />)
		await screen.findByRole('img', { name: 'Your saved signature' })
		await user.click(screen.getByRole('button', { name: 'Sign pre-trip' }))
		expect(mocks.signTrip).toHaveBeenCalledWith({
			tripId: 1,
			signature: 'saved',
			saveSignature: true,
		})
		expect(mocks.toast.success).toHaveBeenCalledWith('Pre-trip signed')
	})

	it('signs with a drawn signature, saving it, and shows a failure', async () => {
		mocks.getSignatureStatus.mockResolvedValue(NONE)
		const user = userEvent.setup()
		renderQ(<TripSignature editable trip={trip()} />)
		await act(async () => {})

		await user.click(screen.getByRole('button', { name: 'Sign pre-trip' }))
		expect(mocks.toast.error).toHaveBeenCalledWith('Sign in the box first')
		expect(mocks.signTrip).not.toHaveBeenCalled()

		sign()
		mocks.signTrip.mockResolvedValueOnce({ errorMessage: 'Too old' })
		await user.click(screen.getByRole('button', { name: 'Sign pre-trip' }))
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not sign the pre-trip',
			{ description: 'Too old' },
		)

		await user.click(screen.getByRole('button', { name: 'Sign pre-trip' }))
		expect(mocks.signTrip).toHaveBeenLastCalledWith({
			tripId: 1,
			signature: DRAWN,
			saveSignature: true,
		})
		// The new saved signature is fetched again.
		expect(mocks.getSignatureStatus).toHaveBeenCalledTimes(2)
	})
})

describe('SignatureSettings', () => {
	it('shows the saved signature and deletes it', async () => {
		const user = userEvent.setup()
		renderQ(<SignatureSettings />)
		expect(
			await screen.findByRole('img', { name: 'Your saved signature' }),
		).toHaveAttribute('src', `/api/signature?v=${encodeURIComponent(WHEN)}`)
		expect(
			screen.getByText('Replace it with a new signature'),
		).toBeVisible()

		await user.click(
			screen.getByRole('button', { name: 'Delete saved signature' }),
		)
		expect(mocks.toast.success).toHaveBeenCalledWith(
			'Saved signature deleted',
		)
		expect(
			screen.getByText(/You don't have a saved signature yet/),
		).toBeInTheDocument()
	})

	it('saves a new signature', async () => {
		mocks.getSignatureStatus.mockResolvedValue(NONE)
		const user = userEvent.setup()
		renderQ(<SignatureSettings />)
		await screen.findByText('Sign here')

		await user.click(screen.getByRole('button', { name: 'Save signature' }))
		expect(mocks.toast.error).toHaveBeenCalledWith('Sign in the box first')

		sign()
		mocks.saveSignature.mockResolvedValueOnce({ errorMessage: 'Bad image' })
		await user.click(screen.getByRole('button', { name: 'Save signature' }))
		expect(mocks.toast.error).toHaveBeenCalledWith(
			'Could not update your signature',
			{ description: 'Bad image' },
		)

		await user.click(screen.getByRole('button', { name: 'Save signature' }))
		expect(mocks.saveSignature).toHaveBeenLastCalledWith(DRAWN)
		expect(mocks.toast.success).toHaveBeenCalledWith('Signature saved')
		expect(
			await screen.findByRole('img', { name: 'Your saved signature' }),
		).toBeInTheDocument()
	})
})
