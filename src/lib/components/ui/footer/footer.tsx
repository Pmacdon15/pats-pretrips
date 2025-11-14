import Link from 'next/link'

const Footer = () => {
	const email = 'patrick@patmac.ca'
	const githubUrl = 'https://github.com/pmacdon15'
	const githubUsername = 'pmacdon15'

	return (
		<footer className="mt-auto bg-gray-900 text-white py-8">
			<div className="container mx-auto text-center">
				<h3 className="text-2xl font-bold mb-4">Pat's PreTrips</h3>
				<div className="flex justify-center space-x-4">
					<a
						className="text-lg text-blue-300 hover:text-blue-100"
						href={`mailto:${email}`}
					>
						{email}
					</a>
					<Link
						className="text-lg text-blue-300 hover:text-blue-100"
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
