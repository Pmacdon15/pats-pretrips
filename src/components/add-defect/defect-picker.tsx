'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { defects, joinDefects, parseDefects } from '@/lib/utils-defects'

/**
 * Tap-to-toggle list of defect categories. Value is stored as a comma
 * separated string so it stays compatible with the database column.
 */
export function DefectPicker({
	value,
	onChange,
	disabledOptions = [],
}: {
	value: string
	onChange: (value: string) => void
	/** Defects that are already recorded and cannot be selected again. */
	disabledOptions?: string[]
}) {
	const selected = parseDefects(value)
	const disabled = new Set(disabledOptions.map((d) => d.toLowerCase()))

	const toggle = (defect: string) => {
		const next = selected.includes(defect)
			? selected.filter((d) => d !== defect)
			: [...selected, defect]
		onChange(joinDefects(next))
	}

	return (
		<fieldset className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<legend className="font-medium text-sm">
					Defects{' '}
					<span className="font-normal text-muted-foreground">
						— tap any that apply
					</span>
				</legend>
				{selected.length > 0 && (
					<button
						className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
						onClick={() => onChange('')}
						type="button"
					>
						<X className="size-3" />
						Clear ({selected.length})
					</button>
				)}
			</div>
			<div className="flex flex-wrap gap-2">
				{defects.map((defect) => {
					const isSelected = selected.includes(defect)
					const isDisabled = disabled.has(defect.toLowerCase())
					return (
						<button
							aria-pressed={isSelected}
							className={cn(
								'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
								'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
								isSelected
									? 'border-warning bg-warning-soft font-medium text-warning-foreground'
									: 'bg-card hover:bg-muted',
								isDisabled &&
									'cursor-not-allowed opacity-40 hover:bg-card',
							)}
							disabled={isDisabled}
							key={defect}
							onClick={() => toggle(defect)}
							title={isDisabled ? 'Already recorded' : undefined}
							type="button"
						>
							{isSelected && <Check className="size-3.5" />}
							{defect}
						</button>
					)
				})}
			</div>
			<p className="text-muted-foreground text-xs">
				{selected.length === 0
					? 'No defects selected.'
					: `${selected.length} selected: ${joinDefects(selected)}`}
			</p>
		</fieldset>
	)
}
