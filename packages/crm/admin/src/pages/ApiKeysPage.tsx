import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useApiKeyScopes, useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/useApiKeys";
import { copyToClipboard, formatRelativeTime } from "@/lib/utils";

export function ApiKeysPage() {
	const { data: keys, isLoading, error } = useApiKeys();
	const { data: scopes } = useApiKeyScopes();
	const createMutation = useCreateApiKey();
	const revokeMutation = useRevokeApiKey();

	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isRevokeModalOpen, setIsRevokeModalOpen] = useState<string | null>(null);
	const [newKeyResult, setNewKeyResult] = useState<{
		id: string;
		name: string;
		key: string;
	} | null>(null);
	const [copied, setCopied] = useState(false);

	const [createForm, setCreateForm] = useState({
		name: "",
		scopes: [] as string[],
	});

	const handleCreate = async () => {
		if (!createForm.name || createForm.scopes.length === 0) return;

		try {
			const result = await createMutation.mutateAsync({
				name: createForm.name,
				scopes: createForm.scopes,
			});
			setNewKeyResult({ id: result.id, name: result.name, key: result.key });
			setCreateForm({ name: "", scopes: [] });
		} catch {
			// Error handled by mutation
		}
	};

	const handleRevoke = async () => {
		if (!isRevokeModalOpen) return;

		try {
			await revokeMutation.mutateAsync(isRevokeModalOpen);
			setIsRevokeModalOpen(null);
		} catch {
			// Error handled by mutation
		}
	};

	const handleCopyKey = async () => {
		if (!newKeyResult) return;
		const success = await copyToClipboard(newKeyResult.key);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const closeNewKeyModal = () => {
		setNewKeyResult(null);
		setIsCreateModalOpen(false);
	};

	const toggleScope = (scope: string) => {
		setCreateForm((prev) => ({
			...prev,
			scopes: prev.scopes.includes(scope)
				? prev.scopes.filter((s) => s !== scope)
				: [...prev.scopes, scope],
		}));
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">API Keys</h1>
					<p className="text-dark-400 mt-1">Manage API keys for programmatic access to the CRM</p>
				</div>
				<Button onClick={() => setIsCreateModalOpen(true)}>
					<PlusIcon className="h-4 w-4" />
					Create Key
				</Button>
			</div>

			{/* Keys List */}
			<Card>
				{isLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
					</div>
				) : error ? (
					<div className="p-6 text-center text-red-400">
						Failed to load API keys. Please try again.
					</div>
				) : keys?.length === 0 ? (
					<div className="p-12 text-center">
						<KeyIcon className="h-12 w-12 mx-auto text-dark-600" />
						<p className="mt-4 text-dark-400">No API keys yet</p>
						<p className="text-sm text-dark-500 mt-1">Create an API key to start using the API</p>
					</div>
				) : (
					<div className="divide-y divide-dark-800">
						{keys?.map((key) => (
							<div key={key.id} className="p-4 flex items-center justify-between">
								<div className="flex-1">
									<div className="flex items-center gap-3">
										<h3 className="font-medium">{key.name}</h3>
										{key.revokedAt && <Badge variant="danger">Revoked</Badge>}
									</div>
									<div className="flex items-center gap-4 mt-2 text-sm text-dark-400">
										<code className="bg-dark-800 px-2 py-0.5 rounded font-mono text-xs">
											{key.keyPrefix}...
										</code>
										<span>Created {formatRelativeTime(key.createdAt)}</span>
										{key.lastUsedAt && <span>Last used {formatRelativeTime(key.lastUsedAt)}</span>}
									</div>
									<div className="flex gap-2 mt-2">
										{key.scopes.map((scope) => (
											<Badge key={scope} variant="default">
												{scope}
											</Badge>
										))}
									</div>
								</div>
								{!key.revokedAt && (
									<Button variant="danger" size="sm" onClick={() => setIsRevokeModalOpen(key.id)}>
										Revoke
									</Button>
								)}
							</div>
						))}
					</div>
				)}
			</Card>

			{/* Create Key Modal */}
			<Modal
				isOpen={isCreateModalOpen && !newKeyResult}
				onClose={() => setIsCreateModalOpen(false)}
				title="Create API Key"
			>
				<div className="space-y-4">
					<Input
						label="Name"
						value={createForm.name}
						onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
						placeholder="e.g., Claude Bot, Zapier Integration"
					/>

					<div>
						<label className="block text-sm font-medium text-dark-300 mb-2">Scopes</label>
						<div className="space-y-2">
							{scopes?.map(({ scope, description }) => (
								<label
									key={scope}
									className="flex items-start gap-3 p-3 rounded-lg border border-dark-700 hover:border-dark-600 cursor-pointer"
								>
									<input
										type="checkbox"
										checked={createForm.scopes.includes(scope)}
										onChange={() => toggleScope(scope)}
										className="mt-0.5 h-4 w-4 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-950"
									/>
									<div>
										<p className="font-medium text-sm">{scope}</p>
										<p className="text-xs text-dark-500">{description}</p>
									</div>
								</label>
							))}
						</div>
					</div>

					<div className="flex justify-end gap-3 pt-4">
						<Button variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleCreate}
							isLoading={createMutation.isPending}
							disabled={!createForm.name || createForm.scopes.length === 0}
						>
							Create Key
						</Button>
					</div>
				</div>
			</Modal>

			{/* New Key Result Modal */}
			<Modal isOpen={!!newKeyResult} onClose={closeNewKeyModal} title="API Key Created">
				<div className="space-y-4">
					<div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
						<p className="text-sm text-yellow-400">
							<strong>Important:</strong> Copy this key now. You won't be able to see it again!
						</p>
					</div>

					<div>
						<label className="block text-sm font-medium text-dark-300 mb-2">Your API Key</label>
						<div className="flex gap-2">
							<code className="flex-1 p-3 bg-dark-800 border border-dark-700 rounded-lg font-mono text-sm break-all">
								{newKeyResult?.key}
							</code>
							<Button variant="secondary" onClick={handleCopyKey}>
								{copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
							</Button>
						</div>
					</div>

					<div className="flex justify-end pt-4">
						<Button onClick={closeNewKeyModal}>Done</Button>
					</div>
				</div>
			</Modal>

			{/* Revoke Confirmation Modal */}
			<Modal
				isOpen={!!isRevokeModalOpen}
				onClose={() => setIsRevokeModalOpen(null)}
				title="Revoke API Key"
				size="sm"
			>
				<p className="text-dark-400 mb-6">
					Are you sure you want to revoke this API key? Any applications using this key will stop
					working immediately.
				</p>
				<div className="flex justify-end gap-3">
					<Button variant="secondary" onClick={() => setIsRevokeModalOpen(null)}>
						Cancel
					</Button>
					<Button variant="danger" onClick={handleRevoke} isLoading={revokeMutation.isPending}>
						Revoke Key
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

function KeyIcon({ className }: { className?: string }) {
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
				d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
			/>
		</svg>
	);
}

function CopyIcon({ className }: { className?: string }) {
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
				d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
			/>
		</svg>
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
		</svg>
	);
}
