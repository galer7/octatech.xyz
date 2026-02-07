import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useWebhook, useWebhookDeliveries } from "@/hooks/useWebhooks";
import type { WebhookDelivery } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function WebhookDeliveriesPage() {
	const { id } = useParams<{ id: string }>();
	const { data: webhook, isLoading: webhookLoading } = useWebhook(id);
	const [page, setPage] = useState(1);
	const { data, isLoading, error } = useWebhookDeliveries(id, page);
	const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);

	if (webhookLoading || isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
			</div>
		);
	}

	if (error || !webhook) {
		return (
			<div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
				Failed to load webhook deliveries.
				<Link to="/webhooks" className="ml-2 text-primary-400 hover:underline">
					Go back to webhooks
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Link
					to="/webhooks"
					className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
				>
					<ArrowLeftIcon className="h-5 w-5" />
				</Link>
				<div>
					<h1 className="text-2xl font-bold">Delivery History</h1>
					<p className="text-dark-400 mt-1">{webhook.name}</p>
				</div>
			</div>

			{/* Deliveries List */}
			<Card>
				{data?.deliveries.length === 0 ? (
					<div className="p-12 text-center">
						<HistoryIcon className="h-12 w-12 mx-auto text-dark-600" />
						<p className="mt-4 text-dark-400">No deliveries yet</p>
						<p className="text-sm text-dark-500 mt-1">
							Deliveries will appear here when events are triggered
						</p>
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-dark-800">
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Status
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Event</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Response
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Duration
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Timestamp
										</th>
										<th className="text-right py-3 px-4 text-sm font-medium text-dark-400">
											Details
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-dark-800">
									{data?.deliveries.map((delivery) => (
										<tr key={delivery.id} className="hover:bg-dark-800/50">
											<td className="py-3 px-4">
												<Badge variant={delivery.success ? "success" : "danger"}>
													{delivery.success ? "Success" : "Failed"}
												</Badge>
											</td>
											<td className="py-3 px-4 text-sm">
												<code className="text-primary-400">{delivery.event}</code>
											</td>
											<td className="py-3 px-4 text-sm text-dark-400">
												{delivery.statusCode || "-"}
											</td>
											<td className="py-3 px-4 text-sm text-dark-400">
												{delivery.durationMs ? `${delivery.durationMs}ms` : "-"}
											</td>
											<td className="py-3 px-4 text-sm text-dark-400">
												{formatDateTime(delivery.createdAt)}
											</td>
											<td className="py-3 px-4 text-right">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setSelectedDelivery(delivery)}
												>
													View
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* Pagination */}
						{data && data.pagination.totalPages > 1 && (
							<div className="flex items-center justify-between px-4 py-3 border-t border-dark-800">
								<p className="text-sm text-dark-400">
									Page {data.pagination.page} of {data.pagination.totalPages}
								</p>
								<div className="flex gap-2">
									<Button
										variant="secondary"
										size="sm"
										disabled={page <= 1}
										onClick={() => setPage(page - 1)}
									>
										Previous
									</Button>
									<Button
										variant="secondary"
										size="sm"
										disabled={page >= data.pagination.totalPages}
										onClick={() => setPage(page + 1)}
									>
										Next
									</Button>
								</div>
							</div>
						)}
					</>
				)}
			</Card>

			{/* Delivery Details Modal */}
			<Modal
				isOpen={!!selectedDelivery}
				onClose={() => setSelectedDelivery(null)}
				title="Delivery Details"
				size="lg"
			>
				{selectedDelivery && (
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-sm text-dark-500">Status</p>
								<Badge variant={selectedDelivery.success ? "success" : "danger"}>
									{selectedDelivery.success ? "Success" : "Failed"}
								</Badge>
							</div>
							<div>
								<p className="text-sm text-dark-500">Event</p>
								<code className="text-primary-400">{selectedDelivery.event}</code>
							</div>
							<div>
								<p className="text-sm text-dark-500">Response Code</p>
								<p className="font-medium">{selectedDelivery.statusCode || "N/A"}</p>
							</div>
							<div>
								<p className="text-sm text-dark-500">Duration</p>
								<p className="font-medium">
									{selectedDelivery.durationMs ? `${selectedDelivery.durationMs}ms` : "N/A"}
								</p>
							</div>
							<div>
								<p className="text-sm text-dark-500">Attempt</p>
								<p className="font-medium">{selectedDelivery.attemptNumber}</p>
							</div>
							<div>
								<p className="text-sm text-dark-500">Timestamp</p>
								<p className="font-medium">{formatDateTime(selectedDelivery.createdAt)}</p>
							</div>
						</div>

						<div>
							<p className="text-sm text-dark-500 mb-2">Request Payload</p>
							<pre className="p-4 bg-dark-800 rounded-lg overflow-auto max-h-48 text-xs font-mono">
								{JSON.stringify(selectedDelivery.payload, null, 2)}
							</pre>
						</div>

						{selectedDelivery.responseBody && (
							<div>
								<p className="text-sm text-dark-500 mb-2">Response Body</p>
								<pre className="p-4 bg-dark-800 rounded-lg overflow-auto max-h-48 text-xs font-mono">
									{selectedDelivery.responseBody}
								</pre>
							</div>
						)}

						{selectedDelivery.nextRetryAt && (
							<div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
								<p className="text-sm text-yellow-400">
									Next retry scheduled for: {formatDateTime(selectedDelivery.nextRetryAt)}
								</p>
							</div>
						)}

						<div className="flex justify-end pt-4">
							<Button onClick={() => setSelectedDelivery(null)}>Close</Button>
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
		</svg>
	);
}

function HistoryIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}
