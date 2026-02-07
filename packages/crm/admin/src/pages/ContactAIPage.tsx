import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateContact, useParseContact } from "@/hooks/useContacts";

export function ContactAIPage() {
	const navigate = useNavigate();
	const parseMutation = useParseContact();
	const createMutation = useCreateContact();

	const [inputText, setInputText] = useState("");
	const [parsed, setParsed] = useState<{
		name: string;
		email: string;
		role: string;
		company: string;
		location: string;
		linkedinUrl: string;
		confidence: number;
		extractedFields: string[];
	} | null>(null);
	const [editedForm, setEditedForm] = useState({
		name: "",
		email: "",
		role: "",
		company: "",
		location: "",
		linkedinUrl: "",
	});

	const handleParse = async () => {
		if (!inputText.trim()) return;

		try {
			const result = await parseMutation.mutateAsync({ text: inputText });
			const data = {
				name: result.parsed.name || "",
				email: result.parsed.email || "",
				role: result.parsed.role || "",
				company: result.parsed.company || "",
				location: result.parsed.location || "",
				linkedinUrl: result.parsed.linkedinUrl || "",
				confidence: result.confidence,
				extractedFields: result.extractedFields,
			};
			setParsed(data);
			setEditedForm({
				name: data.name,
				email: data.email,
				role: data.role,
				company: data.company,
				location: data.location,
				linkedinUrl: data.linkedinUrl,
			});
		} catch {
			// Error handled by mutation
		}
	};

	const handleSave = async () => {
		if (!editedForm.name) return;

		try {
			const contact = await createMutation.mutateAsync({
				name: editedForm.name.trim(),
				email: editedForm.email.trim() || null,
				role: editedForm.role.trim() || null,
				location: editedForm.location.trim() || null,
				linkedinUrl: editedForm.linkedinUrl.trim() || null,
				source: "other",
				relationshipStatus: "identified",
				warmth: "cold",
				tier: "C",
			} as any);
			navigate(`/contacts/${contact.id}`);
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
			role: "",
			company: "",
			location: "",
			linkedinUrl: "",
		});
	};

	return (
		<div className="max-w-3xl mx-auto space-y-6">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Link
					to="/contacts"
					className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
				>
					<ArrowLeftIcon className="h-5 w-5" />
				</Link>
				<div>
					<h1 className="text-2xl font-bold flex items-center gap-2">
						<SparklesIcon className="h-6 w-6 text-primary-400" />
						AI Add Contact
					</h1>
					<p className="text-dark-400 mt-1">
						Paste a LinkedIn profile or any text about a person and AI will extract the contact
						information
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
						placeholder={`Paste any text here, for example:\n\n"John Doe - CTO at Fintech Co | Warsaw, Poland | Building scalable distributed systems | Previously at Google & Stripe | john@fintechco.com\nhttps://linkedin.com/in/johndoe"`}
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
									label="Email"
									type="email"
									value={editedForm.email}
									onChange={(e) => setEditedForm({ ...editedForm, email: e.target.value })}
								/>
								<Input
									label="Role"
									value={editedForm.role}
									onChange={(e) => setEditedForm({ ...editedForm, role: e.target.value })}
								/>
								<Input
									label="Company"
									value={editedForm.company}
									onChange={(e) => setEditedForm({ ...editedForm, company: e.target.value })}
								/>
								<Input
									label="Location"
									value={editedForm.location}
									onChange={(e) => setEditedForm({ ...editedForm, location: e.target.value })}
								/>
								<Input
									label="LinkedIn URL"
									value={editedForm.linkedinUrl}
									onChange={(e) => setEditedForm({ ...editedForm, linkedinUrl: e.target.value })}
								/>
							</div>
							<div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
								<Button variant="secondary" onClick={handleReset}>
									Cancel
								</Button>
								<Button
									onClick={handleSave}
									isLoading={createMutation.isPending}
									disabled={!editedForm.name}
								>
									Save Contact
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
