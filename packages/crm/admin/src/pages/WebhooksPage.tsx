import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from '@/hooks/useWebhooks';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { formatRelativeTime, truncate } from '@/lib/utils';

const WEBHOOK_EVENTS = [
  { value: 'lead.created', label: 'Lead Created' },
  { value: 'lead.updated', label: 'Lead Updated' },
  { value: 'lead.status_changed', label: 'Lead Status Changed' },
  { value: 'lead.deleted', label: 'Lead Deleted' },
  { value: 'lead.activity_added', label: 'Lead Activity Added' },
];

export function WebhooksPage() {
  const { data: webhooks, isLoading, error } = useWebhooks();
  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; statusCode: number; responseTime: number } | null>(null);

  const [form, setForm] = useState({
    name: '',
    url: '',
    events: [] as string[],
    secret: '',
  });

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ name: '', url: '', events: [], secret: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (webhook: typeof webhooks extends (infer T)[] | undefined ? T : never) => {
    if (!webhook) return;
    setEditingId(webhook.id);
    setForm({
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      secret: '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.url || form.events.length === 0) return;

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          data: {
            name: form.name,
            url: form.url,
            events: form.events,
            ...(form.secret && { secret: form.secret }),
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: form.name,
          url: form.url,
          events: form.events,
          secret: form.secret || undefined,
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
      setTestResult({ id, success: false, statusCode: 0, responseTime: 0 });
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-dark-400 mt-1">
            Configure webhooks to receive real-time notifications
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <PlusIcon className="h-4 w-4" />
          Create Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400">
            Failed to load webhooks. Please try again.
          </div>
        ) : webhooks?.length === 0 ? (
          <div className="p-12 text-center">
            <WebhookIcon className="h-12 w-12 mx-auto text-dark-600" />
            <p className="mt-4 text-dark-400">No webhooks configured</p>
            <p className="text-sm text-dark-500 mt-1">
              Create a webhook to receive event notifications
            </p>
          </div>
        ) : (
          <div className="divide-y divide-dark-800">
            {webhooks?.map((webhook) => (
              <div key={webhook.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{webhook.name}</h3>
                      <Toggle
                        checked={webhook.enabled}
                        onChange={(enabled) => handleToggleEnabled(webhook.id, enabled)}
                      />
                      {webhook.failureCount > 0 && (
                        <Badge variant="danger">
                          {webhook.failureCount} failures
                        </Badge>
                      )}
                      {testResult?.id === webhook.id && (
                        <Badge variant={testResult.success ? 'success' : 'danger'}>
                          {testResult.success
                            ? `OK (${testResult.statusCode}) - ${testResult.responseTime}ms`
                            : `Failed (${testResult.statusCode})`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-dark-500 mt-1 font-mono">
                      {truncate(webhook.url, 60)}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {webhook.events.map((event) => (
                        <Badge key={event}>{event}</Badge>
                      ))}
                    </div>
                    {webhook.lastDeliveryAt && (
                      <p className="text-xs text-dark-500 mt-2">
                        Last delivery: {formatRelativeTime(webhook.lastDeliveryAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(webhook.id)}
                      isLoading={testMutation.isPending && testMutation.variables === webhook.id}
                    >
                      Test
                    </Button>
                    <Link to={`/webhooks/${webhook.id}/deliveries`}>
                      <Button variant="ghost" size="sm">
                        History
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(webhook)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => setDeleteId(webhook.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Webhook' : 'Create Webhook'}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Slack Notifications"
          />

          <Input
            label="URL"
            type="url"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://example.com/webhook"
          />

          <Input
            label={editingId ? 'New Secret (leave empty to keep current)' : 'Secret (optional)'}
            type="password"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
            placeholder="Your webhook secret"
            hint="Used to sign webhook payloads with HMAC-SHA256"
          />

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Events
            </label>
            <div className="space-y-2">
              {WEBHOOK_EVENTS.map(({ value, label }) => (
                <label
                  key={value}
                  className="flex items-center gap-3 p-3 rounded-lg border border-dark-700 hover:border-dark-600 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.events.includes(value)}
                    onChange={() => toggleEvent(value)}
                    className="h-4 w-4 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-950"
                  />
                  <span className="text-sm">{label}</span>
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
              disabled={!form.name || !form.url || form.events.length === 0}
            >
              {editingId ? 'Save Changes' : 'Create Webhook'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Webhook"
        size="sm"
      >
        <p className="text-dark-400 mb-6">
          Are you sure you want to delete this webhook? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteMutation.isPending}
          >
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
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function WebhookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}
