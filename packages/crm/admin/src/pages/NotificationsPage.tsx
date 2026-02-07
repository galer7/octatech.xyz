import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import {
	useCreateNotificationChannel,
	useDeleteNotificationChannel,
	useNotificationChannels,
	useNotificationEvents,
	useNotificationTypes,
	useTestNotificationChannel,
	useUpdateNotificationChannel,
} from "@/hooks/useNotifications";
import type { NotificationChannelType } from "@/lib/types";

const CHANNEL_ICONS: Record<NotificationChannelType, React.FC<{ className?: string }>> = {
	discord: DiscordIcon,
	telegram: TelegramIcon,
	email: EmailIcon,
};

export function NotificationsPage() {
	const { data: channels, isLoading, error } = useNotificationChannels();
	const { data: events } = useNotificationEvents();
	const { data: types } = useNotificationTypes();
	const createMutation = useCreateNotificationChannel();
	const updateMutation = useUpdateNotificationChannel();
	const deleteMutation = useDeleteNotificationChannel();
	const testMutation = useTestNotificationChannel();

	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<{
		id: string;
		success: boolean;
		message: string;
	} | null>(null);

	const [form, setForm] = useState({
		type: "" as NotificationChannelType | "",
		name: "",
		config: {} as Record<string, string>,
		events: [] as string[],
	});

	const openCreateModal = () => {
		setEditingId(null);
		setForm({ type: "", name: "", config: {}, events: [] });
		setIsModalOpen(true);
	};

	const openEditModal = (channel: NonNullable<typeof channels>[number]) => {
		setEditingId(channel.id);
		setForm({
			type: channel.type,
			name: channel.name,
			config: { ...channel.config },
			events: [...channel.events],
		});
		setIsModalOpen(true);
	};

	const handleSubmit = async () => {
		if (!form.type || !form.name || form.events.length === 0) return;

		try {
			if (editingId) {
				await updateMutation.mutateAsync({
					id: editingId,
					data: {
						name: form.name,
						config: form.config,
						events: form.events,
					},
				});
			} else {
				await createMutation.mutateAsync({
					type: form.type,
					name: form.name,
					config: form.config,
					events: form.events,
				});
			}
			setIsModalOpen(false);
		} catch {
			// Error handled by mutation
		}
	};

	const handleToggleEnabled = async (id: string, enabled: boolean) => {
		try {
			await updateMutation.mutateAsync({ id, data: { enabled } });
		} catch {
			// Error handled by mutation
		}
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

	const handleTest = async (id: string) => {
		try {
			const result = await testMutation.mutateAsync(id);
			setTestResult({ id, ...result });
			setTimeout(() => setTestResult(null), 5000);
		} catch {
			setTestResult({ id, success: false, message: "Test failed" });
			setTimeout(() => setTestResult(null), 5000);
		}
	};

	const toggleEvent = (event: string) => {
		setForm((prev) => ({
			...prev,
			events: prev.events.includes(event)
				? prev.events.filter((e) => e !== event)
				: [...prev.events, event],
		}));
	};

	const updateConfig = (key: string, value: string) => {
		setForm((prev) => ({
			...prev,
			config: { ...prev.config, [key]: value },
		}));
	};

	const selectedType = types?.find((t) => t.type === form.type);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Notification Channels</h1>
					<p className="text-dark-400 mt-1">Configure how you receive notifications about leads</p>
				</div>
				<Button onClick={openCreateModal}>
					<PlusIcon className="h-4 w-4" />
					Add Channel
				</Button>
			</div>

			{/* Channels List */}
			<Card>
				{isLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
					</div>
				) : error ? (
					<div className="p-6 text-center text-red-400">
						Failed to load notification channels. Please try again.
					</div>
				) : channels?.length === 0 ? (
					<div className="p-12 text-center">
						<BellIcon className="h-12 w-12 mx-auto text-dark-600" />
						<p className="mt-4 text-dark-400">No notification channels configured</p>
						<p className="text-sm text-dark-500 mt-1">
							Add a channel to receive notifications about leads
						</p>
					</div>
				) : (
					<div className="divide-y divide-dark-800">
						{channels?.map((channel) => {
							const Icon = CHANNEL_ICONS[channel.type];
							return (
								<div key={channel.id} className="p-4">
									<div className="flex items-start justify-between">
										<div className="flex gap-4">
											<div className="h-10 w-10 rounded-lg bg-dark-800 flex items-center justify-center">
												<Icon className="h-5 w-5 text-dark-400" />
											</div>
											<div>
												<div className="flex items-center gap-3">
													<h3 className="font-medium">{channel.name}</h3>
													<Toggle
														checked={channel.enabled}
														onChange={(enabled) => handleToggleEnabled(channel.id, enabled)}
													/>
													{testResult?.id === channel.id && (
														<Badge variant={testResult.success ? "success" : "danger"}>
															{testResult.success ? "Sent!" : testResult.message}
														</Badge>
													)}
												</div>
												<p className="text-sm text-dark-500 mt-1 capitalize">{channel.type}</p>
												<div className="flex flex-wrap gap-2 mt-2">
													{channel.events.map((event) => (
														<Badge key={event}>{event}</Badge>
													))}
												</div>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleTest(channel.id)}
												isLoading={testMutation.isPending && testMutation.variables === channel.id}
											>
												Test
											</Button>
											<Button variant="ghost" size="sm" onClick={() => openEditModal(channel)}>
												Edit
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="text-red-400 hover:text-red-300"
												onClick={() => setDeleteId(channel.id)}
											>
												Delete
											</Button>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Card>

			{/* Create/Edit Modal */}
			<Modal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				title={editingId ? "Edit Channel" : "Add Notification Channel"}
				size="lg"
			>
				<div className="space-y-4">
					{!editingId && (
						<Select
							label="Channel Type"
							options={[
								{ value: "", label: "Select type" },
								...(types?.map((t) => ({ value: t.type, label: t.name })) || []),
							]}
							value={form.type}
							onChange={(e) => {
								setForm({ ...form, type: e.target.value as NotificationChannelType, config: {} });
							}}
						/>
					)}

					<Input
						label="Name"
						value={form.name}
						onChange={(e) => setForm({ ...form, name: e.target.value })}
						placeholder="e.g., Sales Team Discord"
					/>

					{selectedType && (
						<div className="space-y-3">
							<p className="text-sm font-medium text-dark-300">Configuration</p>
							{Object.entries(selectedType.configHints).map(([key, hint]) => (
								<Input
									key={key}
									label={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
									value={form.config[key] || ""}
									onChange={(e) => updateConfig(key, e.target.value)}
									placeholder={hint}
									type={key.includes("token") || key.includes("key") ? "password" : "text"}
								/>
							))}
						</div>
					)}

					<div>
						<label className="block text-sm font-medium text-dark-300 mb-2">Events</label>
						<div className="space-y-2">
							{events?.map(({ event, description }) => (
								<label
									key={event}
									className="flex items-start gap-3 p-3 rounded-lg border border-dark-700 hover:border-dark-600 cursor-pointer"
								>
									<input
										type="checkbox"
										checked={form.events.includes(event)}
										onChange={() => toggleEvent(event)}
										className="mt-0.5 h-4 w-4 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-950"
									/>
									<div>
										<p className="font-medium text-sm">{event}</p>
										<p className="text-xs text-dark-500">{description}</p>
									</div>
								</label>
							))}
						</div>
					</div>

					<div className="flex justify-end gap-3 pt-4">
						<Button variant="secondary" onClick={() => setIsModalOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleSubmit}
							isLoading={createMutation.isPending || updateMutation.isPending}
							disabled={!form.type || !form.name || form.events.length === 0}
						>
							{editingId ? "Save Changes" : "Add Channel"}
						</Button>
					</div>
				</div>
			</Modal>

			{/* Delete Confirmation Modal */}
			<Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Channel" size="sm">
				<p className="text-dark-400 mb-6">
					Are you sure you want to delete this notification channel?
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

function BellIcon({ className }: { className?: string }) {
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
				d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
			/>
		</svg>
	);
}

function DiscordIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor">
			<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
		</svg>
	);
}

function TelegramIcon({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor">
			<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
		</svg>
	);
}

function EmailIcon({ className }: { className?: string }) {
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
