import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useDeleteLead, useLeads } from "@/hooks/useLeads";
import type { LeadStatus } from "@/lib/types";
import { formatRelativeTime, formatStatus, getStatusClass } from "@/lib/utils";

const statusOptions = [
	{ value: "", label: "All Statuses" },
	{ value: "new", label: "New" },
	{ value: "contacted", label: "Contacted" },
	{ value: "qualified", label: "Qualified" },
	{ value: "proposal", label: "Proposal" },
	{ value: "won", label: "Won" },
	{ value: "lost", label: "Lost" },
];

const sortOptions = [
	{ value: "createdAt:desc", label: "Newest First" },
	{ value: "createdAt:asc", label: "Oldest First" },
	{ value: "name:asc", label: "Name A-Z" },
	{ value: "name:desc", label: "Name Z-A" },
	{ value: "updatedAt:desc", label: "Recently Updated" },
];

export function LeadsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [search, setSearch] = useState(searchParams.get("search") || "");
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const status = (searchParams.get("status") || "") as LeadStatus | "";
	const sortParam = searchParams.get("sort") || "createdAt:desc";
	const [sortField, sortOrder] = sortParam.split(":") as [string, "asc" | "desc"];
	const page = parseInt(searchParams.get("page") || "1", 10);

	const { data, isLoading, error } = useLeads({
		page,
		limit: 20,
		status: status || undefined,
		search: search || undefined,
		sort: sortField,
		order: sortOrder,
	});

	const deleteMutation = useDeleteLead();

	const updateParams = (updates: Record<string, string | undefined>) => {
		const newParams = new URLSearchParams(searchParams);
		for (const [key, value] of Object.entries(updates)) {
			if (value) {
				newParams.set(key, value);
			} else {
				newParams.delete(key);
			}
		}
		// Reset to page 1 when filters change
		if (!("page" in updates)) {
			newParams.delete("page");
		}
		setSearchParams(newParams);
	};

	const handleSearch = (value: string) => {
		setSearch(value);
		// Debounce search updates
		const timeout = setTimeout(() => {
			updateParams({ search: value || undefined });
		}, 300);
		return () => clearTimeout(timeout);
	};

	const handleDelete = async () => {
		if (!deleteId) return;
		try {
			await deleteMutation.mutateAsync(deleteId);
			setDeleteId(null);
		} catch {
			// Error handled by mutation
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Leads</h1>
					<p className="text-dark-400 mt-1">{data?.pagination.total ?? 0} total leads</p>
				</div>
				<div className="flex gap-3">
					<Link to="/leads/new">
						<Button variant="secondary">
							<PlusIcon className="h-4 w-4" />
							Add Lead
						</Button>
					</Link>
					<Link to="/leads/ai">
						<Button>
							<SparklesIcon className="h-4 w-4" />
							AI Add
						</Button>
					</Link>
				</div>
			</div>

			{/* Filters */}
			<Card className="p-4">
				<div className="flex flex-wrap gap-4">
					<div className="flex-1 min-w-[200px]">
						<Input
							placeholder="Search leads..."
							value={search}
							onChange={(e) => handleSearch(e.target.value)}
						/>
					</div>
					<div className="w-40">
						<Select
							options={statusOptions}
							value={status}
							onChange={(e) => updateParams({ status: e.target.value || undefined })}
						/>
					</div>
					<div className="w-48">
						<Select
							options={sortOptions}
							value={sortParam}
							onChange={(e) => updateParams({ sort: e.target.value })}
						/>
					</div>
				</div>
			</Card>

			{/* Leads Table */}
			<Card>
				{isLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
					</div>
				) : error ? (
					<div className="p-6 text-center text-red-400">
						Failed to load leads. Please try again.
					</div>
				) : data?.data.length === 0 ? (
					<div className="p-12 text-center">
						<UsersIcon className="h-12 w-12 mx-auto text-dark-600" />
						<p className="mt-4 text-dark-400">No leads found</p>
						<p className="text-sm text-dark-500 mt-1">
							{search || status
								? "Try adjusting your filters"
								: "Add your first lead to get started"}
						</p>
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-dark-800">
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Name</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Email</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Company
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Status
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Created
										</th>
										<th className="text-right py-3 px-4 text-sm font-medium text-dark-400">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-dark-800">
									{data?.data.map((lead) => (
										<tr key={lead.id} className="hover:bg-dark-800/50 transition-colors">
											<td className="py-3 px-4">
												<Link
													to={`/leads/${lead.id}`}
													className="font-medium hover:text-primary-400 transition-colors"
												>
													{lead.name}
												</Link>
												{lead.aiParsed && (
													<SparklesIcon className="inline-block h-3.5 w-3.5 ml-1.5 text-primary-400" />
												)}
											</td>
											<td className="py-3 px-4 text-dark-400">{lead.email}</td>
											<td className="py-3 px-4 text-dark-400">{lead.company || "-"}</td>
											<td className="py-3 px-4">
												<Badge className={getStatusClass(lead.status)}>
													{formatStatus(lead.status)}
												</Badge>
											</td>
											<td className="py-3 px-4 text-dark-400 text-sm">
												{formatRelativeTime(lead.createdAt)}
											</td>
											<td className="py-3 px-4 text-right">
												<div className="flex items-center justify-end gap-2">
													<Link to={`/leads/${lead.id}`}>
														<Button variant="ghost" size="sm">
															View
														</Button>
													</Link>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setDeleteId(lead.id)}
														className="text-red-400 hover:text-red-300"
													>
														Delete
													</Button>
												</div>
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
										onClick={() => updateParams({ page: String(page - 1) })}
									>
										Previous
									</Button>
									<Button
										variant="secondary"
										size="sm"
										disabled={page >= data.pagination.totalPages}
										onClick={() => updateParams({ page: String(page + 1) })}
									>
										Next
									</Button>
								</div>
							</div>
						)}
					</>
				)}
			</Card>

			{/* Delete Confirmation Modal */}
			<Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Lead" size="sm">
				<p className="text-dark-400 mb-6">
					Are you sure you want to delete this lead? This action cannot be undone.
				</p>
				<div className="flex justify-end gap-3">
					<Button variant="secondary" onClick={() => setDeleteId(null)}>
						Cancel
					</Button>
					<Button variant="danger" onClick={handleDelete} isLoading={deleteMutation.isPending}>
						Delete
					</Button>
				</div>
			</Modal>
		</div>
	);
}

// Icons
function PlusIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
		</svg>
	);
}

function SparklesIcon({ className }: { className?: string }) {
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
				d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
			/>
		</svg>
	);
}

function UsersIcon({ className }: { className?: string }) {
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
				d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
			/>
		</svg>
	);
}
