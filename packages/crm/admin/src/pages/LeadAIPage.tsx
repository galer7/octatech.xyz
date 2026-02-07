import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateLead, useParseLead } from "@/hooks/useLeads";

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

export function LeadAIPage() {
	const navigate = useNavigate();
	const parseMutation = useParseLead();
	const createMutation = useCreateLead();

	const [inputText, setInputText] = useState("");
	const [parsed, setParsed] = useState<{
		name: string;
		email: string;
		company: string;
		phone: string;
		budget: string;
		projectType: string;
		source: string;
		message: string;
		confidence: number;
		extractedFields: string[];
	} | null>(null);
	const [editedForm, setEditedForm] = useState({
		name: "",
		email: "",
		company: "",
		phone: "",
		budget: "",
		projectType: "",
		source: "",
		message: "",
	});

	const handleParse = async () => {
		if (!inputText.trim()) return;

		try {
			const result = await parseMutation.mutateAsync({ text: inputText });
			const data = {
				name: result.parsed.name || "",
				email: result.parsed.email || "",
				company: result.parsed.company || "",
				phone: result.parsed.phone || "",
				budget: result.parsed.budget || "",
				projectType: result.parsed.projectType || "",
				source: result.parsed.source || "",
				message: result.parsed.message || "",
				confidence: result.confidence,
				extractedFields: result.extractedFields,
			};
			setParsed(data);
			setEditedForm({
				name: data.name,
				email: data.email,
				company: data.company,
				phone: data.phone,
				budget: data.budget,
				projectType: data.projectType,
				source: data.source,
				message: data.message,
			});
		} catch {
			// Error handled by mutation
		}
	};

	const handleSave = async () => {
		if (!editedForm.name || !editedForm.email) return;

		try {
			const lead = await createMutation.mutateAsync({
				name: editedForm.name.trim(),
				email: editedForm.email.trim(),
				company: editedForm.company.trim() || null,
				phone: editedForm.phone.trim() || null,
				budget: editedForm.budget || null,
				projectType: editedForm.projectType || null,
				source: editedForm.source || null,
				message: editedForm.message.trim() || null,
				rawInput: inputText,
				aiParsed: true,
			} as any);
			navigate(`/leads/${lead.id}`);
		} catch {
			// Error handled by mutation
		}
	};

	const handleReset = () => {
		setInputText("");
		setParsed(null);
		setEditedForm({
			name: "",
			email: "",
			company: "",
			phone: "",
			budget: "",
			projectType: "",
			source: "",
			message: "",
		});
	};

	return (
		<div className="max-w-3xl mx-auto space-y-6">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Link
					to="/leads"
					className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
				>
					<ArrowLeftIcon className="h-5 w-5" />
				</Link>
				<div>
					<h1 className="text-2xl font-bold flex items-center gap-2">
						<SparklesIcon className="h-6 w-6 text-primary-400" />
						AI Add Lead
					</h1>
					<p className="text-dark-400 mt-1">
						Paste any text about a potential lead and AI will extract the relevant information
					</p>
				</div>
			</div>

			{/* Input Section */}
			<Card>
				<CardHeader>
					<h2 className="font-semibold">Input Text</h2>
				</CardHeader>
				<CardContent>
					<Textarea
						value={inputText}
						onChange={(e) => setInputText(e.target.value)}
						placeholder={`Paste any text here, for example:\n\n"Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc. They're looking for help with their cloud migration, budget around $75k, found us through LinkedIn. Phone: 415-555-9876"`}
						rows={6}
						disabled={!!parsed}
					/>
					{!parsed && (
						<div className="flex justify-end mt-4">
							<Button
								onClick={handleParse}
								isLoading={parseMutation.isPending}
								disabled={!inputText.trim()}
							>
								<SparklesIcon className="h-4 w-4" />
								Parse with AI
							</Button>
						</div>
					)}
					{parseMutation.isError && (
						<p className="text-red-400 text-sm mt-2">Failed to parse text. Please try again.</p>
					)}
				</CardContent>
			</Card>

			{/* Parsed Results */}
			{parsed && (
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<h2 className="font-semibold">Extracted Information</h2>
								<Badge
									variant={
										parsed.confidence >= 0.7
											? "success"
											: parsed.confidence >= 0.4
												? "warning"
												: "danger"
									}
								>
									{Math.round(parsed.confidence * 100)}% confidence
								</Badge>
							</div>
							<Button variant="ghost" size="sm" onClick={handleReset}>
								Start Over
							</Button>
						</div>
						{parsed.extractedFields.length > 0 && (
							<p className="text-sm text-dark-500 mt-2">
								Extracted fields: {parsed.extractedFields.join(", ")}
							</p>
						)}
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<Input
									label="Name *"
									value={editedForm.name}
									onChange={(e) => setEditedForm({ ...editedForm, name: e.target.value })}
									error={!editedForm.name ? "Name is required" : undefined}
								/>
								<Input
									label="Email *"
									type="email"
									value={editedForm.email}
									onChange={(e) => setEditedForm({ ...editedForm, email: e.target.value })}
									error={!editedForm.email ? "Email is required" : undefined}
								/>
								<Input
									label="Company"
									value={editedForm.company}
									onChange={(e) => setEditedForm({ ...editedForm, company: e.target.value })}
								/>
								<Input
									label="Phone"
									value={editedForm.phone}
									onChange={(e) => setEditedForm({ ...editedForm, phone: e.target.value })}
								/>
								<Select
									label="Budget"
									options={budgetOptions}
									value={editedForm.budget}
									onChange={(e) => setEditedForm({ ...editedForm, budget: e.target.value })}
								/>
								<Select
									label="Project Type"
									options={projectTypeOptions}
									value={editedForm.projectType}
									onChange={(e) => setEditedForm({ ...editedForm, projectType: e.target.value })}
								/>
								<Select
									label="Source"
									options={sourceOptions}
									value={editedForm.source}
									onChange={(e) => setEditedForm({ ...editedForm, source: e.target.value })}
								/>
							</div>
							<Textarea
								label="Message"
								value={editedForm.message}
								onChange={(e) => setEditedForm({ ...editedForm, message: e.target.value })}
								rows={3}
							/>
							<div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
								<Button variant="secondary" onClick={handleReset}>
									Cancel
								</Button>
								<Button
									onClick={handleSave}
									isLoading={createMutation.isPending}
									disabled={!editedForm.name || !editedForm.email}
								>
									Save Lead
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

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
