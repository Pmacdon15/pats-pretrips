import { Check, Copy } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	showCopyButton?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, showCopyButton, ...props }, ref) => {
		const [hasCopied, setHasCopied] = React.useState(false)

		React.useEffect(() => {
			if (hasCopied) {
				const timer = setTimeout(() => {
					setHasCopied(false)
				}, 2000)
				return () => clearTimeout(timer)
			}
		}, [hasCopied])

		const handleCopy = () => {
			if (typeof props.value === 'string') {
				navigator.clipboard.writeText(props.value)
				setHasCopied(true)
			}
		}

		return (
			<div className="relative flex items-center">
				<input
					className={cn(
						'h-9 w-full min-w-0 rounded-md border border-input bg-white/30 px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-blue-200 selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
						'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
						'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
						showCopyButton && 'pr-10',
						className,
					)}
					ref={ref}
					type={type}
					{...props}
				/>
				{showCopyButton && props.value && (
					<Button
						className="absolute right-1 h-7 w-7 px-0"
						onClick={handleCopy}
						size="sm"
						type="button"
						variant="ghost"
					>
						<span className="sr-only">Copy</span>
						{hasCopied ? (
							<Check className="h-4 w-4" />
						) : (
							<Copy className="h-4 w-4" />
						)}
					</Button>
				)}
			</div>
		)
	},
)
Input.displayName = 'Input'

export { Input }
