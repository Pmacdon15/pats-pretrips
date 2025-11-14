import Link from 'next/link'

const Footer = () => {
	const email = 'patrick@patmac.ca'
	const githubUrl = 'https://github.com/pmacdon15'
	const githubUsername = 'pmacdon15'

	return (
		<footer className="mt-auto bg-gray-800 py-4 text-white">
			<div className="container mx-auto text-center">
				<p>
					Contact:{' '}
					<a
						className="text-blue-400 hover:underline"
						href={`mailto:${email}`}
					>
						{email}
					</a>
				</p>
				<p>
					GitHub:{' '}
					<Link
						className="text-blue-400 hover:underline"
						href={githubUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						{githubUsername}
					</Link>
				</p>
			</div>
		</footer>
	)
}

export default Footer
