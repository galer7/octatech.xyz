import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useAddActivity, useDeleteLead, useLead, useUpdateLead } from "@/hooks/useLeads";
import type { ActivityType, LeadStatus } from "@/lib/types";
import {
	cn,
	formatBudget,
	formatDateTime,
	formatProjectType,
	formatRelativeTime,
	formatSource,
	formatStatus,
	getStatusClass,
} from "@/lib/utils";

const allStatuses: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

const budgetOptions = [
	{ value: "", label: "Not specified" },
	{ value: "under_10k", label: "Under $10k" },
	{ value: "10k_25k", label: "$10k - $25k" },
	{ value: "25k_50k", label: "$25k - $50k" },
	{ value: "50k_100k", label: "$50k - $100k" },
	{ value: "100k_250k", label: "$100k - $250k" },
	{ value: "250k_plus", label: "$250k+" },
];

const projectTypeOptions = [
	{ value: "", label: "Not specified" },
	{ value: "new_product", label: "New Product / MVP" },
	{ value: "existing_product", label: "Existing Product Enhancement" },
	{ value: "maintenance", label: "Maintenance & Support" },
	{ value: "consulting", label: "Technical Consulting" },
	{ value: "staff_augmentation", label: "Staff Augmentation" },
	{ value: "other", label: "Other" },
];

const sourceOptions = [
	{ value: "", label: "Unknown" },
	{ value: "website", label: "Website" },
	{ value: "referral", label: "Referral" },
	{ value: "linkedin", label: "LinkedIn" },
	{ value: "google", label: "Google Search" },
	{ value: "twitter", label: "Twitter/X" },
	{ value: "cold_outreach", label: "Cold Outreach" },
	{ value: "event", label: "Event" },
	{ value: "other", label: "Other" },
];

export function LeadDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { data: lead, isLoading, error } = useLead(id);
	const updateMutation = useUpdateLead();
	const deleteMutation = useDeleteLead();
	const addActivityMutation = useAddActivity();

	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
	const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
	const [noteText, setNoteText] = useState("");
	const [editForm, setEditForm] = useState({
		name: "",
		email: "",
		company: "",
		phone: "",
		budget: "",
		projectType: "",
		source: "",
		message: "",
		notes: "",
	});

	const openEditModal = () => {
		if (lead) {
			setEditForm({
				name: lead.name,
				email: lead.email,
				company: lead.company || "",
				phone: lead.phone || "",
				budget: lead.budget || "",
				projectType: lead.projectType || "",
				source: lead.source || "",
				message: lead.message || "",
				notes: lead.notes || "",
			});
			setIsEditModalOpen(true);
		}
	};

	const handleStatusChange = async (newStatus: LeadStatus) => {
		if (!id || !lead || lead.status === newStatus) return;
		try {
			await updateMutation.mutateAsync({ id, data: { status: newStatus } });
		} catch {
			// Error handled by mutation
		}
	};

	const handleEdit = async () => {
		if (!id) return;
		try {
			await updateMutation.mutateAsync({
				id,
				data: {
					name: editForm.name,
					email: editForm.email,
					company: editForm.company || null,
					phone: editForm.phone || null,
					budget: editForm.budget || null,
					projectType: editForm.projectType || null,
					source: editForm.source || null,
					message: editForm.message || null,
					notes: editForm.notes || null,
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
			navigate("/leads");
		} catch {
			// Error handled by mutation
		}
	};

	const handleAddNote = async () => {
		if (!id || !noteText.trim()) return;
		try {
			await addActivityMutation.mutateAsync({
				leadId: id,
				type: "note",
				description: noteText.trim(),
			});
			setNoteText("");
			setIsNoteModalOpen(false);
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

	if (error || !lead) {
		return (
			<div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
				Lead not found or failed to load.
				<Link to="/leads" className="ml-2 text-primary-400 hover:underline">
					Go back to leads
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
						to="/leads"
						className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
					>
						<ArrowLeftIcon className="h-5 w-5" />
					</Link>
					<div>
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-bold">{lead.name}</h1>
							{lead.aiParsed && (
								<Badge variant="info">
									<SparklesIcon className="h-3 w-3 mr-1" />
									AI Parsed
								</Badge>
							)}
						</div>
						<p className="text-dark-400 mt-1">{lead.email}</p>
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

			{/* Status Bar */}
			<Card className="p-4">
				<div className="flex items-center gap-2">
					<span className="text-sm text-dark-400 mr-2">Status:</span>
					{allStatuses.map((status) => (
						<button
							key={status}
							onClick={() => handleStatusChange(status)}
							disabled={updateMutation.isPending}
							className={cn(
								"px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
								lead.status === status
									? getStatusClass(status)
									: "border-dark-700 text-dark-400 hover:border-dark-600 hover:text-dark-300",
							)}
						>
							{formatStatus(status)}
						</button>
					))}
				</div>
			</Card>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Lead Details */}
				<div className="lg:col-span-2 space-y-6">
					<Card>
						<CardHeader>
							<h2 className="text-lg font-semibold">Lead Information</h2>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-sm text-dark-500">Company</p>
									<p className="font-medium">{lead.company || "Not specified"}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Phone</p>
									<p className="font-medium">{lead.phone || "Not specified"}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Budget</p>
									<p className="font-medium">{formatBudget(lead.budget)}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Project Type</p>
									<p className="font-medium">{formatProjectType(lead.projectType)}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Source</p>
									<p className="font-medium">{formatSource(lead.source)}</p>
								</div>
								<div>
									<p className="text-sm text-dark-500">Created</p>
									<p className="font-medium">{formatDateTime(lead.createdAt)}</p>
								</div>
							</div>

							{lead.message && (
								<div className="pt-4 border-t border-dark-800">
									<p className="text-sm text-dark-500 mb-2">Message</p>
									<p className="text-dark-300 whitespace-pre-wrap">{lead.message}</p>
								</div>
							)}

							{lead.notes && (
								<div className="pt-4 border-t border-dark-800">
									<p className="text-sm text-dark-500 mb-2">Notes</p>
									<p className="text-dark-300 whitespace-pre-wrap">{lead.notes}</p>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Activity Timeline */}
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between">
								<h2 className="text-lg font-semibold">Activity</h2>
								<Button variant="secondary" size="sm" onClick={() => setIsNoteModalOpen(true)}>
									<PlusIcon className="h-4 w-4" />
									Add Note
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							{lead.activities?.length === 0 ? (
								<p className="text-dark-500 text-center py-8">No activity yet</p>
							) : (
								<div className="space-y-4">
									{lead.activities?.map((activity) => (
										<div key={activity.id} className="flex gap-4">
											<div className="flex-shrink-0">
												<ActivityIcon type={activity.type} />
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium">
														{getActivityTitle(activity.type)}
													</span>
													<span className="text-xs text-dark-500">
														{formatRelativeTime(activity.createdAt)}
													</span>
												</div>
												<p className="text-sm text-dark-400 mt-1">{activity.description}</p>
												{activity.type === "status_change" &&
													activity.oldStatus &&
													activity.newStatus && (
														<div className="flex items-center gap-2 mt-2">
															<Badge className={getStatusClass(activity.oldStatus)}>
																{formatStatus(activity.oldStatus)}
															</Badge>
															<span className="text-dark-500">→</span>
															<Badge className={getStatusClass(activity.newStatus)}>
																{formatStatus(activity.newStatus)}
															</Badge>
														</div>
													)}
											</div>
										</div>
									))}
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
							<Button
								variant="secondary"
								className="w-full justify-start"
								onClick={() => setIsNoteModalOpen(true)}
							>
								<NoteIcon className="h-4 w-4" />
								Add Note
							</Button>
							<a href={`mailto:${lead.email}`}>
								<Button variant="secondary" className="w-full justify-start">
									<MailIcon className="h-4 w-4" />
									Send Email
								</Button>
							</a>
							{lead.phone && (
								<a href={`tel:${lead.phone}`}>
									<Button variant="secondary" className="w-full justify-start">
										<PhoneIcon className="h-4 w-4" />
										Call
									</Button>
								</a>
							)}
						</CardContent>
					</Card>

					{lead.tags && lead.tags.length > 0 && (
						<Card>
							<CardHeader>
								<h3 className="font-semibold">Tags</h3>
							</CardHeader>
							<CardContent>
								<div className="flex flex-wrap gap-2">
									{lead.tags.map((tag) => (
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
				title="Edit Lead"
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
							label="Email"
							type="email"
							value={editForm.email}
							onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
							required
						/>
						<Input
							label="Company"
							value={editForm.company}
							onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
						/>
						<Input
							label="Phone"
							value={editForm.phone}
							onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
						/>
						<Select
							label="Budget"
							options={budgetOptions}
							value={editForm.budget}
							onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })}
						/>
						<Select
							label="Project Type"
							options={projectTypeOptions}
							value={editForm.projectType}
							onChange={(e) => setEditForm({ ...editForm, projectType: e.target.value })}
						/>
						<Select
							label="Source"
							options={sourceOptions}
							value={editForm.source}
							onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
						/>
					</div>
					<Textarea
						label="Message"
						value={editForm.message}
						onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
						rows={3}
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
				title="Delete Lead"
				size="sm"
			>
				<p className="text-dark-400 mb-6">
					Are you sure you want to delete this lead? This action cannot be undone.
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

			{/* Add Note Modal */}
			<Modal
				isOpen={isNoteModalOpen}
				onClose={() => setIsNoteModalOpen(false)}
				title="Add Note"
				size="md"
			>
				<Textarea
					placeholder="Enter your note..."
					value={noteText}
					onChange={(e) => setNoteText(e.target.value)}
					rows={4}
				/>
				<div className="flex justify-end gap-3 mt-4">
					<Button variant="secondary" onClick={() => setIsNoteModalOpen(false)}>
						Cancel
					</Button>
					<Button
						onClick={handleAddNote}
						isLoading={addActivityMutation.isPending}
						disabled={!noteText.trim()}
					>
						Add Note
					</Button>
				</div>
			</Modal>
		</div>
	);
}

function getActivityTitle(type: ActivityType): string {
	const titles: Record<ActivityType, string> = {
		note: "Note added",
		email: "Email sent",
		call: "Call made",
		meeting: "Meeting held",
		status_change: "Status changed",
		created: "Lead created",
	};
	return titles[type] || type;
}

function ActivityIcon({ type }: { type: ActivityType }) {
	const className = "h-8 w-8 p-1.5 rounded-full bg-dark-800";

	switch (type) {
		case "note":
			return <NoteIcon className={className} />;
		case "email":
			return <MailIcon className={className} />;
		case "call":
			return <PhoneIcon className={className} />;
		case "meeting":
			return <CalendarIcon className={className} />;
		case "status_change":
			return <RefreshIcon className={className} />;
		case "created":
			return <SparklesIcon className={className} />;
		default:
			return <CircleIcon className={className} />;
	}
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

function NoteIcon({ className }: { className?: string }) {
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

function MailIcon({ className }: { className?: string }) {
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
				d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
			/>
		</svg>
	);
}

function PhoneIcon({ className }: { className?: string }) {
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
				d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
			/>
		</svg>
	);
}

function CalendarIcon({ className }: { className?: string }) {
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
				d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
			/>
		</svg>
	);
}

function RefreshIcon({ className }: { className?: string }) {
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
				d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
			/>
		</svg>
	);
}

function CircleIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<circle cx="12" cy="12" r="8" />
		</svg>
	);
}
