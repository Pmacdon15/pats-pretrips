'use client'

import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Repair } from '@/lib/db/repairs'
import { defectStatuses } from '@/lib/repairs/status'
import { RepairForm } from './repair-form'
import { RepairSummary } from './repair-summary'

/**
 * A trip's defects, each open or repaired. Open ones can be marked repaired
 * at any time (repairs often happen days later); repaired ones show who fixed
 * them, the invoice and the signature.
 */
export function DefectStatusList({
	tripId,
	defects,
	repairs,
}: {
	tripId: number
	defects: string
	repairs: Repair[]
}) {
	const [repairing, setRepairing] = useState<string | null>(null)
	const list = defectStatuses(defects, repairs)
	if (list.length === 0) return null
	const open = list.filter((d) => !d.repair).length

	return (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-sm">
				{open === 0
					? 'Every defect on this trip has been repaired.'
					: `${open} of ${list.length} defect${list.length === 1 ? '' : 's'} still open.`}
			</p>
			<ul className="flex flex-col divide-y rounded-lg border">
				{list.map(({ defect, repair }) => (
					<li className="flex flex-col gap-3 p-3" key={defect}>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="flex items-center gap-2">
								<span className="font-medium">{defect}</span>
								{repair ? (
									<Badge variant="success">
										<CheckCircle2 />
										Repaired
									</Badge>
								) : (
									<Badge variant="warning">
										<AlertTriangle />
										Open
									</Badge>
								)}
							</span>
							{!repair && repairing !== defect ? (
								<Button
									onClick={() => setRepairing(defect)}
									size="sm"
									type="button"
									variant="outline"
								>
									<Wrench />
									Mark repaired
								</Button>
							) : null}
						</div>
						{repair ? <RepairSummary repair={repair} /> : null}
						{!repair && repairing === defect ? (
							<RepairForm
								defect={defect}
								onDone={() => setRepairing(null)}
								tripId={tripId}
							/>
						) : null}
					</li>
				))}
			</ul>
		</div>
	)
}
