import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function Disclaimer({ text, name }: { text: string; name: string }) {
	return (
		<div className="mx-auto w-full max-w-2xl px-4 py-12">
			<Card>
				<CardHeader>
					<h1 className="font-semibold text-2xl tracking-tight">
						{name.trim()}
					</h1>
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<p className="text-muted-foreground leading-relaxed">
						{text.replace(/\s+/g, ' ').trim()}
					</p>
					<Link
						className={buttonVariants({
							variant: 'outline',
							className: 'self-start',
						})}
						href="/"
					>
						<ArrowLeft />
						Back home
					</Link>
				</CardContent>
			</Card>
		</div>
	)
}
