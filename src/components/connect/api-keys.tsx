'use client'
import { KeyRound, List, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/actions/api-keys'
import type { ApiKey } from '@/lib/api-keys'
import { CopyButton } from './copy-button'

const dateLabel = new Intl.DateTimeFormat('en-CA', {
	month: 'short',
	day: 'numeric',
	year: 'numeric',
	timeZone: 'UTC',
})

/**
 * Create, show once and revoke the driver's personal API keys. The list of
 * existing keys loads only when the driver asks for it.
 */
export function ApiKeys() {
	/** null until the driver asks to see their keys. */
	const [keys, setKeys] = useState<ApiKey[] | null>(null)
	const [name, setName] = useState('')
	const [newKey, setNewKey] = useState<string | null>(null)
	const [pending, startTransition] = useTransition()

	const load = () =>
		startTransition(async () => {
			const res = await listApiKeys()
			if ('errorMessage' in res) {
				toast.error(res.errorMessage)
				return
			}
			setKeys(res.value)
		})

	const create = () =>
		startTransition(async () => {
			const res = await createApiKey({ name })
			if ('errorMessage' in res) {
				toast.error(res.errorMessage)
				return
			}
			setKeys((list) => list && [res.value.apiKey, ...list])
			setNewKey(res.value.key)
			setName('')
		})

	const revoke = (key: ApiKey) =>
		startTransition(async () => {
			const res = await revokeApiKey(key.id)
			if ('errorMessage' in res) {
				toast.error(res.errorMessage)
				return
			}
			setKeys((list) => list?.filter((k) => k.id !== key.id) ?? null)
			toast.success(`Revoked ${key.name}`)
		})

	return (
		<div className="grid gap-3">
			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault()
					create()
				}}
			>
				<Input
					aria-label="Key name"
					maxLength={60}
					onChange={(e) => setName(e.target.value)}
					placeholder="Name it, e.g. Muse"
					value={name}
				/>
				<Button disabled={pending || !name.trim()} type="submit">
					<KeyRound /> Create API key
				</Button>
			</form>
			{newKey && (
				<div className="grid gap-1 rounded-md border border-primary/40 bg-accent p-3">
					<p className="font-medium">
						Copy your key now. It won&apos;t be shown again.
					</p>
					<div className="flex items-center gap-2">
						<code className="min-w-0 flex-1 truncate text-xs">
							{newKey}
						</code>
						<CopyButton label="Copy API key" value={newKey} />
					</div>
				</div>
			)}
			{keys === null ? (
				<Button
					className="justify-self-start"
					disabled={pending}
					onClick={load}
					size="sm"
					type="button"
					variant="ghost"
				>
					<List /> Show my API keys
				</Button>
			) : keys.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					You have no API keys.
				</p>
			) : (
				<ul className="grid gap-1">
					{keys.map((key) => (
						<li
							className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
							key={key.id}
						>
							<div className="min-w-0">
								<p className="truncate font-medium">
									{key.name}
								</p>
								<p className="text-muted-foreground text-xs">
									<code>{key.prefix}…</code> · created{' '}
									{dateLabel.format(new Date(key.createdAt))}
									{key.lastUsedAt
										? ` · last used ${dateLabel.format(new Date(key.lastUsedAt))}`
										: ' · never used'}
								</p>
							</div>
							<Button
								aria-label={`Revoke ${key.name}`}
								disabled={pending}
								onClick={() => revoke(key)}
								size="sm"
								variant="ghost"
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
