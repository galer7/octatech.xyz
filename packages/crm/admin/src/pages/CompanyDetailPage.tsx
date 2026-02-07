import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCompany, useDeleteCompany, useUpdateCompany } from "@/hooks/useCompanies";
import type { CompanyContractType, CompanySize } from "@/lib/types";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";

const sizeOptions = [
	{ value: "", label: "Not specified" },
	{ value: "solo", label: "Solo" },
	{ value: "startup", label: "Startup (2-10)" },
	{ value: "small", label: "Small (11-50)" },
	{ value: "medium", label: "Medium (51-200)" },
	{ value: "large", label: "Large (201-1000)" },
	{ value: "enterprise", label: "Enterprise (1000+)" },
];

const contractTypeOptions = [
	{ value: "", label: "Not specified" },
	{ value: "b2b", label: "B2B" },
	{ value: "employment", label: "Employment" },
	{ value: "both", label: "Both" },
	{ value: "unknown", label: "Unknown" },
];

const hiringOptions = [
	{ value: "", label: "Not specified" },
	{ value: "true", label: "Yes" },
	{ value: "false", label: "No" },
];

export function CompanyDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { data: company, isLoading, error } = useCompany(id);
	const updateMutation = useUpdateCompany();
	const deleteMutation = useDeleteCompany();

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [editForm, setEditForm] = useState({
		name: "",
		industry: "",
		size: "" as CompanySize | "",
		location: "",
		website: "",
		linkedinUrl: "",
		contractType: "" as CompanyContractType | "",
		hiringContractors: "" as "" | "true" | "false",
		notes: "",
		tags: "",
	});

	const openEditModal = () => {
		if (company) {
			setEditForm({
				name: company.name,
				industry: company.industry || "",
				size: company.size || "",
				location: company.location || "",
				website: company.website || "",
				linkedinUrl: company.linkedinUrl || "",
				contractType: company.contractType || "",
				hiringContractors:
					company.hiringContractors === null ? "" : company.hiringContractors ? "true" : "false",
				notes: company.notes || "",
				tags: company.tags?.join(", ") || "",
			});
			setIsEditModalOpen(true);
		}
	};

	const handleEdit = async () => {
		if (!id) return;
		try {
			await updateMutation.mutateAsync({
				id,
				data: {
					name: editForm.name,
					industry: editForm.industry || null,
					size: (editForm.size || null) as CompanySize | null,
					location: editForm.location || null,
					website: editForm.website || null,
					linkedinUrl: editForm.linkedinUrl || null,
					contractType: (editForm.contractType || null) as CompanyContractType | null,
					hiringContractors:
						editForm.hiringContractors === "" ? null : editForm.hiringContractors === "true",
					notes: editForm.notes || null,
					tags: editForm.tags
						? editForm.tags
								.split(",")
								.map((t) => t.trim())
								.filter(Boolean)
						: [],
				} as any,
			});
			setIsEditModalOpen(false);
		} catch {
			// Error handled by mutation
		}
	};

	const handleDelete = async () => {
		if (!id) return;
		try {
			await deleteMutation.mutateAsync(id);
			navigate("/companies");
		} catch {
			// Error handled by mutation
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
			</div>
		);
	}

	if (error || !company) {
		return (
			<div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
				Company not found or failed to load.
				<Link to="/companies" className="ml-2 text-primary-400 hover:underline">
					Go back to companies
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link
						to="/companies"
						className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
					>
						<ArrowLeftIcon className="h-5 w-5" />
					</Link>
					<div>
						<h1 className="text-2xl font-bold">{company.name}</h1>
						{company.industry && <p className="text-dark-400 mt-1">{company.industry}</p>}
					</div>
				</div>
				<div className="flex gap-3">
					<Button variant="secondary" onClick={openEditModal}>
						Edit
					</Button>
					<Button variant="danger" onClick={() => setIsDeleteModalOpen(true)}>
						Delete
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Company Details */}
				<div className="lg:col-span-2 space-y-6">
					<Card>
						<CardHeader>
							<h2 className="text-lg font-semibold">Company Information</h2>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-sm text-dark-500">Industry</p>
									<p className="font-medium">{company.industry || "Not specified"}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Size</p>
									<p className="font-medium">
										{company.size ? formatSize(company.size) : "Not specified"}
									</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Location</p>
									<p className="font-medium">{company.location || "Not specified"}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Website</p>
									{company.website ? (
										<a
											href={company.website}
											target="_blank"
											rel="noopener noreferrer"
											className="font-medium text-primary-400 hover:text-primary-300 transition-colors"
										>
											{company.website}
										</a>
									) : (
										<p className="font-medium">Not specified</p>
									)}
								</div>
								<div>
									<p className="text-sm text-dark-500">LinkedIn</p>
									{company.linkedinUrl ? (
										<a
											href={company.linkedinUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="font-medium text-primary-400 hover:text-primary-300 transition-colors"
										>
											View Profile
										</a>
									) : (
										<p className="font-medium">Not specified</p>
									)}
								</div>
								<div>
									<p className="text-sm text-dark-500">Contract Type</p>
									<p className="font-medium">
										{company.contractType
											? formatContractType(company.contractType)
											: "Not specified"}
									</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Hiring Contractors</p>
									<p className="font-medium">
										{company.hiringContractors === true
											? "Yes"
											: company.hiringContractors === false
												? "No"
												: "Not specified"}
									</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Created</p>
									<p className="font-medium">{formatDateTime(company.createdAt)}</p>
								</div>
							</div>

							{company.notes && (
								<div className="pt-4 border-t border-dark-800">
									<p className="text-sm text-dark-500 mb-2">Notes</p>
									<p className="text-dark-300 whitespace-pre-wrap">{company.notes}</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Contacts */}
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<h2 className="text-lg font-semibold">
									Contacts ({company.contacts?.length ?? 0})
								</h2>
								<Link to={`/contacts/new?companyId=${company.id}`}>
									<Button variant="secondary" size="sm">
										<PlusIcon className="h-4 w-4" />
										Add Contact
									</Button>
								</Link>
							</div>
						</CardHeader>
						<CardContent>
							{!company.contacts || company.contacts.length === 0 ? (
								<p className="text-dark-500 text-center py-8">No contacts yet</p>
							) : (
								<div className="overflow-x-auto">
									<table className="w-full">
										<thead>
											<tr className="border-b border-dark-800">
												<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
													Name
												</th>
												<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
													Role
												</th>
												<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
													Warmth
												</th>
												<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
													Status
												</th>
												<th className="text-left py-3 px-4 text-sm font-medium text-dark-400">
													Last Interaction
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-dark-800">
											{company.contacts.map((contact) => (
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
														<Badge variant={getWarmthBadgeVariant(contact.warmth)}>
															{formatWarmth(contact.warmth)}
														</Badge>
													</td>
													<td className="py-3 px-4">
														<Badge>{formatRelationshipStatus(contact.relationshipStatus)}</Badge>
													</td>
													<td className="py-3 px-4 text-dark-400 text-sm">
														{contact.lastInteractionAt
															? formatRelativeTime(contact.lastInteractionAt)
															: "Never"}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<h3 className="font-semibold">Quick Actions</h3>
						</CardHeader>
						<CardContent className="space-y-2">
							<Button variant="secondary" className="w-full justify-start" onClick={openEditModal}>
								<EditIcon className="h-4 w-4" />
								Edit Company
							</Button>
							{company.website && (
								<a href={company.website} target="_blank" rel="noopener noreferrer">
									<Button variant="secondary" className="w-full justify-start">
										<GlobeIcon className="h-4 w-4" />
										Visit Website
									</Button>
								</a>
							)}
							{company.linkedinUrl && (
								<a href={company.linkedinUrl} target="_blank" rel="noopener noreferrer">
									<Button variant="secondary" className="w-full justify-start">
										<LinkIcon className="h-4 w-4" />
										View LinkedIn
									</Button>
								</a>
							)}
						</CardContent>
					</Card>

					{company.tags && company.tags.length > 0 && (
						<Card>
							<CardHeader>
								<h3 className="font-semibold">Tags</h3>
							</CardHeader>
							<CardContent>
								<div className="flex flex-wrap gap-2">
									{company.tags.map((tag) => (
										<Badge key={tag}>{tag}</Badge>
									))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			{/* Edit Modal */}
			<Modal
				isOpen={isEditModalOpen}
				onClose={() => setIsEditModalOpen(false)}
				title="Edit Company"
				size="lg"
			>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<Input
							label="Name"
							value={editForm.name}
							onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
							required
						/>
						<Input
							label="Industry"
							value={editForm.industry}
							onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
						/>
						<Select
							label="Size"
							options={sizeOptions}
							value={editForm.size}
							onChange={(e) =>
								setEditForm({ ...editForm, size: e.target.value as CompanySize | "" })
							}
						/>
						<Input
							label="Location"
							value={editForm.location}
							onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
						/>
						<Input
							label="Website"
							value={editForm.website}
							onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
							placeholder="https://example.com"
						/>
						<Input
							label="LinkedIn URL"
							value={editForm.linkedinUrl}
							onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
							placeholder="https://linkedin.com/company/..."
						/>
						<Select
							label="Contract Type"
							options={contractTypeOptions}
							value={editForm.contractType}
							onChange={(e) =>
								setEditForm({
									...editForm,
									contractType: e.target.value as CompanyContractType | "",
								})
							}
						/>
						<Select
							label="Hiring Contractors"
							options={hiringOptions}
							value={editForm.hiringContractors}
							onChange={(e) =>
								setEditForm({
									...editForm,
									hiringContractors: e.target.value as "" | "true" | "false",
								})
							}
						/>
					</div>
					<Input
						label="Tags"
						value={editForm.tags}
						onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
						hint="Comma-separated (e.g., fintech, remote, series-b)"
					/>
					<Textarea
						label="Notes"
						value={editForm.notes}
						onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
						rows={3}
					/>
					<div className="flex justify-end gap-3 pt-4">
						<Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleEdit} isLoading={updateMutation.isPending}>
							Save Changes
						</Button>
					</div>
				</div>
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal
				isOpen={isDeleteModalOpen}
				onClose={() => setIsDeleteModalOpen(false)}
				title="Delete Company"
				size="sm"
			>
				<p className="text-dark-400 mb-6">
					Are you sure you want to delete this company? This action cannot be undone.
				</p>
				<div className="flex justify-end gap-3">
					<Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
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
function formatSize(size: string): string {
	const labels: Record<string, string> = {
		solo: "Solo",
		startup: "Startup (2-10)",
		small: "Small (11-50)",
		medium: "Medium (51-200)",
		large: "Large (201-1000)",
		enterprise: "Enterprise (1000+)",
	};
	return labels[size] || size;
}

function formatContractType(contractType: string): string {
	const labels: Record<string, string> = {
		b2b: "B2B",
		employment: "Employment",
		both: "Both",
		unknown: "Unknown",
	};
	return labels[contractType] || contractType;
}

function formatWarmth(warmth: string): string {
	const labels: Record<string, string> = {
		cold: "Cold",
		warm: "Warm",
		hot: "Hot",
	};
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

function formatRelationshipStatus(status: string): string {
	const labels: Record<string, string> = {
		new: "New",
		active: "Active",
		nurturing: "Nurturing",
		dormant: "Dormant",
		lost: "Lost",
	};
	return labels[status] || status;
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

function EditIcon({ className }: { className?: string }) {
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
				d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
			/>
		</svg>
	);
}

function GlobeIcon({ className }: { className?: string }) {
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
				d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
			/>
		</svg>
	);
}

function LinkIcon({ className }: { className?: string }) {
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
				d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
			/>
		</svg>
	);
}
