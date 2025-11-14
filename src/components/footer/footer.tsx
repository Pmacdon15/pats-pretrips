import Link from 'next/link'

const Footer = () => {
	const email = 'patrick@patmac.ca'
	const githubUrl = 'https://github.com/pmacdon15'
	const githubUsername = 'pmacdon15'

	return (
		<footer className="mt-auto bg-gray-900 py-8 text-white">
			<div className="container mx-auto text-center">
				<h3 className="mb-4 font-bold text-2xl">Pat's PreTrips</h3>
				<div className="flex justify-center space-x-4">
					<a
						className="text-blue-300 text-lg hover:text-blue-100"
						href={`mailto:${email}`}
					>
						{email}
					</a>
					<Link
						className="text-blue-300 text-lg hover:text-blue-100"
						href={githubUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						{githubUsername}
					</Link>
				</div>
			</div>
		</footer>
	)
}

export default Footer
