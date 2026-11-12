'use client'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function CopyButton({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false)
	return (
		<Button
			aria-label={label}
			onClick={async () => {
				await navigator.clipboard.writeText(value)
				setCopied(true)
			}}
			size="sm"
			type="button"
			variant="outline"
		>
			{copied ? <Check /> : <Copy />}
		</Button>
	)
}
