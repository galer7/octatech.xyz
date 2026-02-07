import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCompanies } from "@/hooks/useCompanies";
import { useContacts, useCreateContact, useDeleteContact } from "@/hooks/useContacts";
import type { ContactSource, ContactTier, ContactWarmth } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

const statusOptions = [
	{ value: "", label: "All Statuses" },
	{ value: "identified", label: "Identified" },
	{ value: "first_interaction", label: "First Interaction" },
	{ value: "engaged", label: "Engaged" },
	{ value: "conversation", label: "Conversation" },
	{ value: "opportunity", label: "Opportunity" },
	{ value: "converted", label: "Converted" },
	{ value: "dormant", label: "Dormant" },
];

const warmthOptions = [
	{ value: "", label: "All Warmth" },
	{ value: "cold", label: "Cold" },
	{ value: "warm", label: "Warm" },
	{ value: "hot", label: "Hot" },
];

const tierOptions = [
	{ value: "", label: "All Tiers" },
	{ value: "A", label: "Tier A" },
	{ value: "B", label: "Tier B" },
	{ value: "C", label: "Tier C" },
];

const sortOptions = [
	{ value: "-lastInteractionAt", label: "Last Interaction" },
	{ value: "name", label: "Name A-Z" },
	{ value: "-name", label: "Name Z-A" },
	{ value: "-nextActionDue", label: "Follow-up Due" },
	{ value: "-createdAt", label: "Newest First" },
	{ value: "createdAt", label: "Oldest First" },
];

const sourceFormOptions = [
	{ value: "", label: "Not specified" },
	{ value: "linkedin_search", label: "LinkedIn Search" },
	{ value: "linkedin_post_engagement", label: "LinkedIn Post" },
	{ value: "linkedin_comment", label: "LinkedIn Comment" },
	{ value: "referral", label: "Referral" },
	{ value: "event", label: "Event" },
	{ value: "cold_outreach", label: "Cold Outreach" },
	{ value: "other", label: "Other" },
];

const warmthFormOptions = [
	{ value: "cold", label: "Cold" },
	{ value: "warm", label: "Warm" },
	{ value: "hot", label: "Hot" },
];

const tierFormOptions = [
	{ value: "A", label: "Tier A (7-day cadence)" },
	{ value: "B", label: "Tier B (21-day cadence)" },
	{ value: "C", label: "Tier C (60-day cadence)" },
];

export function ContactsPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const [search, setSearch] = useState(searchParams.get("search") || "");
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [createForm, setCreateForm] = useState({
		name: "",
		email: "",
		phone: "",
		role: "",
		linkedinUrl: "",
		location: "",
		companyId: "",
		source: "" as ContactSource | "",
		warmth: "cold" as ContactWarmth,
		tier: "C" as ContactTier,
		nextAction: "",
		notes: "",
		tags: "",
	});

	const relationshipStatus = searchParams.get("relationshipStatus") || "";
	const warmth = searchParams.get("warmth") || "";
	const tier = searchParams.get("tier") || "";
	const followUpDue = searchParams.get("followUpDue") || "";
	const sortParam = searchParams.get("sort") || "-lastInteractionAt";
	const page = parseInt(searchParams.get("page") || "1", 10);

	const { data, isLoading, error } = useContacts({
		page,
		limit: 20,
		search: search || undefined,
		relationshipStatus: relationshipStatus || undefined,
		warmth: warmth || undefined,
		tier: tier || undefined,
		followUpDue: followUpDue ? true : undefined,
		sort: sortParam,
	});

	// Fetch companies for the create modal dropdown
	const { data: companiesData } = useCompanies({ limit: 100 });

	const companyOptions = [
		{ value: "", label: "No company" },
		...(companiesData?.data || []).map((c) => ({
			value: c.id,
			label: c.name,
		})),
	];

	const deleteMutation = useDeleteContact();
	const createMutation = useCreateContact();

	const updateParams = (updates: Record<string, string | undefined>) => {
		const newParams = new URLSearchParams(searchParams);
		for (const [key, value] of Object.entries(updates)) {
			if (value) {
				newParams.set(key, value);
			} else {
				newParams.delete(key);
			}
		}
		if (!("page" in updates)) {
			newParams.delete("page");
		}
		setSearchParams(newParams);
	};

	const handleSearch = (value: string) => {
		setSearch(value);
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

	const handleCreate = async () => {
		try {
			await createMutation.mutateAsync({
				name: createForm.name,
				email: createForm.email || null,
				phone: createForm.phone || null,
				role: createForm.role || null,
				linkedinUrl: createForm.linkedinUrl || null,
				location: createForm.location || null,
				companyId: createForm.companyId || null,
				source: (createForm.source || "other") as ContactSource,
				warmth: createForm.warmth,
				tier: createForm.tier,
				nextAction: createForm.nextAction || null,
				notes: createForm.notes || null,
				tags: createForm.tags
					? createForm.tags
							.split(",")
							.map((t) => t.trim())
							.filter(Boolean)
					: [],
			} as any);
			setIsCreateModalOpen(false);
			setCreateForm({
				name: "",
				email: "",
				phone: "",
				role: "",
				linkedinUrl: "",
				location: "",
				companyId: "",
				source: "",
				warmth: "cold",
				tier: "C",
				nextAction: "",
				notes: "",
				tags: "",
			});
		} catch {
			// Error handled by mutation
		}
	};

	const toggleFollowUpDue = () => {
		updateParams({ followUpDue: followUpDue ? undefined : "true" });
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Contacts</h1>
					<p className="text-dark-400 mt-1">{data?.pagination.total ?? 0} total contacts</p>
				</div>
				<div className="flex gap-3">
					<Link to="/contacts/ai">
						<Button variant="secondary">
							<SparklesIcon className="h-4 w-4" />
							AI Add
						</Button>
					</Link>
					<Button onClick={() => setIsCreateModalOpen(true)}>
						<PlusIcon className="h-4 w-4" />
						Add Contact
					</Button>
				</div>
			</div>

			{/* Filters */}
			<Card className="p-4">
				<div className="flex flex-wrap gap-4">
					<div className="flex-1 min-w-[200px]">
						<Input
							placeholder="Search contacts..."
							value={search}
							onChange={(e) => handleSearch(e.target.value)}
						/>
					</div>
					<div className="w-40">
						<Select
							options={statusOptions}
							value={relationshipStatus}
							onChange={(e) => updateParams({ relationshipStatus: e.target.value || undefined })}
						/>
					</div>
					<div className="w-32">
						<Select
							options={warmthOptions}
							value={warmth}
							onChange={(e) => updateParams({ warmth: e.target.value || undefined })}
						/>
					</div>
					<div className="w-32">
						<Select
							options={tierOptions}
							value={tier}
							onChange={(e) => updateParams({ tier: e.target.value || undefined })}
						/>
					</div>
					<div className="w-40">
						<Select
							options={sortOptions}
							value={sortParam}
							onChange={(e) => updateParams({ sort: e.target.value })}
						/>
					</div>
					<Button
						variant={followUpDue ? "primary" : "secondary"}
						size="sm"
						onClick={toggleFollowUpDue}
						className="h-10"
					>
						<ClockIcon className="h-4 w-4" />
						Follow-up Due
					</Button>
				</div>
			</Card>

			{/* Contacts Table */}
			<Card>
				{isLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
					</div>
				) : error ? (
					<div className="p-6 text-center text-red-400">
						Failed to load contacts. Please try again.
					</div>
				) : data?.data.length === 0 ? (
					<div className="p-12 text-center">
						<ContactIcon className="h-12 w-12 mx-auto text-dark-600" />
						<p className="mt-4 text-dark-400">No contacts found</p>
						<p className="text-sm text-dark-500 mt-1">
							{search || relationshipStatus || warmth || tier || followUpDue
								? "Try adjusting your filters"
								: "Add your first contact to get started"}
						</p>
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead>
									<tr className="border-b border-dark-800">
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Name</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Role</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Company
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Warmth
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Status
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Tier</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Next Action Due
										</th>
										<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
											Last Interaction
										</th>
										<th className="text-right py-3 px-4 text-sm font-medium text-dark-400">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-dark-800">
									{data?.data.map((contact) => (
										<tr key={contact.id} className="hover:bg-dark-800/50 transition-colors">
											<td className="py-3 px-4">
												<Link
													to={`/contacts/${contact.id}`}
													className="font-medium hover:text-primary-400 transition-colors"
												>
													{contact.name}
												</Link>
											</td>
											<td className="py-3 px-4 text-dark-400">{contact.role || "-"}</td>
											<td className="py-3 px-4">
												{contact.company ? (
													<Link
														to={`/companies/${contact.company.id}`}
														className="text-primary-400 hover:text-primary-300 transition-colors"
													>
														{contact.company.name}
													</Link>
												) : (
													<span className="text-dark-500">-</span>
												)}
											</td>
											<td className="py-3 px-4">
												<Badge variant={getWarmthBadgeVariant(contact.warmth)}>
													{formatWarmth(contact.warmth)}
												</Badge>
											</td>
											<td className="py-3 px-4">
												<Badge variant={getStatusBadgeVariant(contact.relationshipStatus)}>
													{formatStatus(contact.relationshipStatus)}
												</Badge>
											</td>
											<td className="py-3 px-4">
												<Badge>{contact.tier || "C"}</Badge>
											</td>
											<td className="py-3 px-4 text-dark-400 text-sm">
												{contact.nextActionDue ? formatRelativeTime(contact.nextActionDue) : "-"}
											</td>
											<td className="py-3 px-4 text-dark-400 text-sm">
												{contact.lastInteractionAt
													? formatRelativeTime(contact.lastInteractionAt)
													: "Never"}
											</td>
											<td className="py-3 px-4 text-right">
												<div className="flex items-center justify-end gap-2">
													<Link to={`/contacts/${contact.id}`}>
														<Button variant="ghost" size="sm">
															View
														</Button>
													</Link>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setDeleteId(contact.id)}
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

			{/* Create Contact Modal */}
			<Modal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				title="Add Contact"
				size="lg"
			>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<Input
							label="Name *"
							value={createForm.name}
							onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
							required
						/>
						<Input
							label="Email"
							type="email"
							value={createForm.email}
							onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
						/>
						<Input
							label="Role"
							value={createForm.role}
							onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
							placeholder="e.g., CTO, Engineering Lead"
						/>
						<Input
							label="Phone"
							value={createForm.phone}
							onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
						/>
						<Input
							label="LinkedIn URL"
							value={createForm.linkedinUrl}
							onChange={(e) => setCreateForm({ ...createForm, linkedinUrl: e.target.value })}
							placeholder="https://linkedin.com/in/..."
						/>
						<Input
							label="Location"
							value={createForm.location}
							onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
							placeholder="e.g., Warsaw, Poland"
						/>
						<Select
							label="Company"
							options={companyOptions}
							value={createForm.companyId}
							onChange={(e) => setCreateForm({ ...createForm, companyId: e.target.value })}
						/>
						<Select
							label="Source"
							options={sourceFormOptions}
							value={createForm.source}
							onChange={(e) =>
								setCreateForm({ ...createForm, source: e.target.value as ContactSource | "" })
							}
						/>
						<Select
							label="Warmth"
							options={warmthFormOptions}
							value={createForm.warmth}
							onChange={(e) =>
								setCreateForm({ ...createForm, warmth: e.target.value as ContactWarmth })
							}
						/>
						<Select
							label="Tier"
							options={tierFormOptions}
							value={createForm.tier}
							onChange={(e) =>
								setCreateForm({ ...createForm, tier: e.target.value as ContactTier })
							}
						/>
					</div>
					<Input
						label="Next Action"
						value={createForm.nextAction}
						onChange={(e) => setCreateForm({ ...createForm, nextAction: e.target.value })}
						placeholder="e.g., Comment on their latest post"
					/>
					<Input
						label="Tags"
						value={createForm.tags}
						onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
						hint="Comma-separated (e.g., cto, fintech, priority)"
					/>
					<Textarea
						label="Notes"
						value={createForm.notes}
						onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
						rows={3}
					/>
					<div className="flex justify-end gap-3 pt-4">
						<Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleCreate}
							isLoading={createMutation.isPending}
							disabled={!createForm.name.trim()}
						>
							Create Contact
						</Button>
					</div>
				</div>
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Contact" size="sm">
				<p className="text-dark-400 mb-6">
					Are you sure you want to delete this contact? All interactions will be removed. This
					action cannot be undone.
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

// Helpers
function formatWarmth(warmth: string): string {
	const labels: Record<string, string> = { cold: "Cold", warm: "Warm", hot: "Hot" };
	return labels[warmth] || warmth;
}

function getWarmthBadgeVariant(
	warmth: string,
): "default" | "success" | "warning" | "danger" | "info" {
	const variants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
		cold: "info",
		warm: "warning",
		hot: "danger",
	};
	return variants[warmth] || "default";
}

function formatStatus(status: string): string {
	const labels: Record<string, string> = {
		identified: "Identified",
		first_interaction: "First Interaction",
		engaged: "Engaged",
		conversation: "Conversation",
		opportunity: "Opportunity",
		converted: "Converted",
		dormant: "Dormant",
	};
	return labels[status] || status;
}

function getStatusBadgeVariant(
	status: string,
): "default" | "success" | "warning" | "danger" | "info" {
	const variants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
		identified: "default",
		first_interaction: "info",
		engaged: "warning",
		conversation: "warning",
		opportunity: "success",
		converted: "success",
		dormant: "danger",
	};
	return variants[status] || "default";
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

function ContactIcon({ className }: { className?: string }) {
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
				d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
			/>
		</svg>
	);
}

function ClockIcon({ className }: { className?: string }) {
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
