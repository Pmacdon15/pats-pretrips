'use client'
import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs'
import { useEffect, useState } from 'react'
import { useGetAddress } from '@/lib/hooks/hooks'
import { useAddTrip } from '@/lib/hooks/mutations/mutations'
import { AddDefect } from '../../add-defect/AddDefect'
import Input from '../../input/Input'

export default function AddTrip() {
	const { user } = useKindeBrowserClient()

	const driverEmail = user?.email

	const [showForm, setShowForm] = useState(false)
	const { mutate } = useAddTrip()
	const { location } = useGetLocation()
	const { data: addressData } = useGetAddress(
		location?.latitude ?? 0,
		location?.longitude ?? 0,
		driverEmail || '',
	)
	const formattedAddress =
		addressData?.data?.features[0]?.properties?.formatted

	return (
		<div className="flex w-full flex-col justify-between gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6 md:flex-row">
			<div className="flex w-full flex-col">
				<form
					action={(formData: FormData) => {
						mutate({ driverEmail: String(driverEmail), formData })
						setShowForm(false)
					}}
					className={`flex w-full flex-col gap-4 ${showForm ? 'block' : 'hidden'}`}
				>
					<h1 className="text-2xl">Create a Trip</h1>
					<div className="flex w-full flex-col gap-4">
						<Input
							name="carrier"
							placeHolder="Carrier"
							required={true}
						/>
						<Input
							name="carrier-address"
							placeHolder="Carrier Address"
							required={true}
						/>
						<Input
							defaultValue={formattedAddress || ''}
							name="inspection-address"
							placeHolder="Inspection Address"
							required={true}
						/>
					</div>
					<div className="flex w-full gap-4">
						<Input name="make" placeHolder="Make" required={true} />
						<Input
							name="model"
							placeHolder="Model"
							required={true}
						/>
						<Input
							name="odometer"
							placeHolder="Odometer Reading"
							required={true}
						/>
					</div>
					<div className="flex w-full gap-4">
						<Input name="truck-plate" placeHolder="Truck Plate" />
						<Input
							name="trailer-plate"
							placeHolder="Trailer Plate"
						/>
						<Input
							name="trailer-b-plate"
							placeHolder="Trailer B Plate"
						/>
					</div>
					<AddDefect required={false} />
					<button
						className={`rounded-lg bg-green-500 p-4 shadow-lg hover:bg-green-600`}
						type="button"
					>
						Submit
					</button>
				</form>
			</div>
			<div className="flex w-full flex-col justify-end md:w-1/6">
				<ButtonToggle
					onClick={() => setShowForm(!showForm)}
					text="Add Trip"
					toggle={showForm}
					toggleText="Cancel"
				></ButtonToggle>
			</div>
		</div>
	)
}

function ButtonToggle({
	text,
	toggleText,
	onClick,
	toggle,
}: {
	text: string
	toggleText: string
	onClick: () => void
	toggle: boolean
}) {
	return (
		<button
			className={`rounded-lg p-4 ${toggle ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} shadow-lg`}
			onClick={onClick}
			type="button"
		>
			{toggle ? toggleText : text}
		</button>
	)
}

function useGetLocation() {
	const [location, setLocation] = useState<{
		latitude: number
		longitude: number
	} | null>(null)

	useEffect(() => {
		async function getLocation() {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(async (position) => {
					setLocation({
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
					})
				})
			} else {
				console.log('Geolocation is not supported by this browser.')
			}
		}
		getLocation()
	}, [])

	return { location }
}
