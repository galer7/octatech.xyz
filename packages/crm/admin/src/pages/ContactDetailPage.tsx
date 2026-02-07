import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useContact, useUpdateContact, useDeleteContact, useCreateInteraction } from '@/hooks/useContacts';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import type { ContactTier, ContactRelationshipStatus } from '@/lib/types';

const interactionTypeOptions = [
  { value: 'linkedin_comment', label: 'LinkedIn Comment' },
  { value: 'linkedin_like', label: 'LinkedIn Like' },
  { value: 'linkedin_dm_sent', label: 'LinkedIn DM Sent' },
  { value: 'linkedin_dm_received', label: 'LinkedIn DM Received' },
  { value: 'linkedin_connection_sent', label: 'Connection Request Sent' },
  { value: 'linkedin_connection_accepted', label: 'Connection Accepted' },
  { value: 'linkedin_post_engagement', label: 'Post Engagement' },
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'email_received', label: 'Email Received' },
  { value: 'call', label: 'Phone Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
];

const directionOptions = [
  { value: 'outbound', label: 'Outbound (You initiated)' },
  { value: 'inbound', label: 'Inbound (They initiated)' },
];

const statusSteps: { value: ContactRelationshipStatus; label: string }[] = [
  { value: 'identified', label: 'Identified' },
  { value: 'first_interaction', label: 'First Interaction' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'converted', label: 'Converted' },
];

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading, error } = useContact(id);
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();
  const interactionMutation = useCreateInteraction(id || '');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    linkedinUrl: '',
    location: '',
    source: '',
    nextAction: '',
    nextActionDue: '',
    notes: '',
    tags: '',
  });
  const [interactionForm, setInteractionForm] = useState({
    type: 'linkedin_comment',
    direction: 'outbound',
    description: '',
    url: '',
  });

  const openEditModal = () => {
    if (contact) {
      setEditForm({
        name: contact.name,
        email: contact.email || '',
        phone: contact.phone || '',
        role: contact.role || '',
        linkedinUrl: contact.linkedinUrl || '',
        location: contact.location || '',
        source: contact.source || '',
        nextAction: contact.nextAction || '',
        nextActionDue: contact.nextActionDue ? contact.nextActionDue.slice(0, 16) : '',
        notes: contact.notes || '',
        tags: contact.tags?.join(', ') || '',
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
          email: editForm.email || null,
          phone: editForm.phone || null,
          role: editForm.role || null,
          linkedinUrl: editForm.linkedinUrl || null,
          location: editForm.location || null,
          source: editForm.source || null,
          nextAction: editForm.nextAction || null,
          nextActionDue: editForm.nextActionDue ? new Date(editForm.nextActionDue).toISOString() : null,
          notes: editForm.notes || null,
          tags: editForm.tags
            ? editForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
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
      navigate('/contacts');
    } catch {
      // Error handled by mutation
    }
  };

  const handleStatusChange = async (newStatus: ContactRelationshipStatus) => {
    if (!id || !contact || contact.relationshipStatus === newStatus) return;
    try {
      await updateMutation.mutateAsync({
        id,
        data: { relationshipStatus: newStatus } as any,
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleTierChange = async (newTier: ContactTier) => {
    if (!id || !contact) return;
    try {
      await updateMutation.mutateAsync({
        id,
        data: { tier: newTier } as any,
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleAddInteraction = async () => {
    if (!interactionForm.description.trim()) return;
    try {
      await interactionMutation.mutateAsync({
        type: interactionForm.type,
        direction: interactionForm.direction,
        description: interactionForm.description,
        url: interactionForm.url || null,
      });
      setIsInteractionModalOpen(false);
      setInteractionForm({
        type: 'linkedin_comment',
        direction: 'outbound',
        description: '',
        url: '',
      });
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

  if (error || !contact) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
        Contact not found or failed to load.
        <Link to="/contacts" className="ml-2 text-primary-400 hover:underline">
          Go back to contacts
        </Link>
      </div>
    );
  }

  const statusIndex = statusSteps.findIndex((s) => s.value === contact.relationshipStatus);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/contacts"
            className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{contact.name}</h1>
              <Badge variant={getWarmthBadgeVariant(contact.warmth)}>
                {formatWarmth(contact.warmth)}
              </Badge>
            </div>
            {contact.role && (
              <p className="text-dark-400 mt-1">{contact.role}</p>
            )}
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
      {contact.relationshipStatus !== 'dormant' && (
        <Card className="p-4">
          <div className="flex gap-2">
            {statusSteps.map((step, index) => {
              const isActive = index <= statusIndex;
              const isCurrent = step.value === contact.relationshipStatus;
              return (
                <button
                  key={step.value}
                  onClick={() => handleStatusChange(step.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    isCurrent
                      ? 'bg-primary-500 text-white'
                      : isActive
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'bg-dark-800 text-dark-500 hover:bg-dark-700'
                  }`}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Contact Information</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-dark-500">Email</p>
                  <p className="font-medium">{contact.email || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-dark-500">Phone</p>
                  <p className="font-medium">{contact.phone || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-dark-500">Role</p>
                  <p className="font-medium">{contact.role || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-dark-500">Location</p>
                  <p className="font-medium">{contact.location || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-dark-500">LinkedIn</p>
                  {contact.linkedinUrl ? (
                    <a
                      href={contact.linkedinUrl}
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
                  <p className="text-sm text-dark-500">Source</p>
                  <p className="font-medium">{formatSource(contact.source) || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-dark-500">Created</p>
                  <p className="font-medium">{formatDateTime(contact.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-dark-500">Last Interaction</p>
                  <p className="font-medium">
                    {contact.lastInteractionAt
                      ? formatRelativeTime(contact.lastInteractionAt)
                      : 'Never'}
                  </p>
                </div>
              </div>

              {contact.notes && (
                <div className="pt-4 border-t border-dark-800">
                  <p className="text-sm text-dark-500 mb-2">Notes</p>
                  <p className="text-dark-300 whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Company Card */}
          {contact.company && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Company</h2>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/companies/${contact.company.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-dark-700 flex items-center justify-center">
                    <BuildingIcon className="h-5 w-5 text-dark-400" />
                  </div>
                  <div>
                    <p className="font-medium text-primary-400">{contact.company.name}</p>
                    {contact.company.industry && (
                      <p className="text-sm text-dark-500">{contact.company.industry}</p>
                    )}
                  </div>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Interactions Timeline */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Interactions ({contact.interactions?.length ?? 0})
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsInteractionModalOpen(true)}
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Interaction
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!contact.interactions || contact.interactions.length === 0 ? (
                <p className="text-dark-500 text-center py-8">
                  No interactions yet. Start building the relationship!
                </p>
              ) : (
                <div className="space-y-4">
                  {contact.interactions.map((interaction) => (
                    <div
                      key={interaction.id}
                      className="flex gap-3 p-3 rounded-lg border border-dark-800"
                    >
                      <div className="flex-shrink-0 mt-1">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            interaction.direction === 'inbound'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-primary-500/20 text-primary-400'
                          }`}
                        >
                          {interaction.direction === 'inbound' ? (
                            <ArrowDownIcon className="h-4 w-4" />
                          ) : (
                            <ArrowUpIcon className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge>{formatInteractionType(interaction.type)}</Badge>
                          <span className="text-sm text-dark-500">
                            {formatRelativeTime(interaction.createdAt)}
                          </span>
                        </div>
                        <p className="text-dark-300">{interaction.description}</p>
                        {interaction.url && (
                          <a
                            href={interaction.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-400 hover:text-primary-300 transition-colors mt-1 inline-block"
                          >
                            View link
                          </a>
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
          {/* Follow-up Card */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Follow-up</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact.nextAction ? (
                <>
                  <p className="text-dark-300">{contact.nextAction}</p>
                  {contact.nextActionDue && (
                    <p className="text-sm text-dark-500">
                      Due: {formatRelativeTime(contact.nextActionDue)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-dark-500 text-sm">No follow-up action set</p>
              )}
            </CardContent>
          </Card>

          {/* Tier Selector */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Tier</h3>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {(['A', 'B', 'C'] as ContactTier[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTierChange(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      contact.tier === t
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-dark-500 mt-2">
                {contact.tier === 'A'
                  ? '7-day touch cadence'
                  : contact.tier === 'B'
                    ? '21-day touch cadence'
                    : '60-day touch cadence'}
              </p>
            </CardContent>
          </Card>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Tags</h3>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Quick Actions</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setInteractionForm({
                    type: 'linkedin_comment',
                    direction: 'outbound',
                    description: '',
                    url: '',
                  });
                  setIsInteractionModalOpen(true);
                }}
              >
                <ChatIcon className="h-4 w-4" />
                Log LinkedIn Comment
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => {
                  setInteractionForm({
                    type: 'linkedin_dm_sent',
                    direction: 'outbound',
                    description: '',
                    url: '',
                  });
                  setIsInteractionModalOpen(true);
                }}
              >
                <MailIcon className="h-4 w-4" />
                Log DM
              </Button>
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" className="w-full justify-start">
                    <LinkIcon className="h-4 w-4" />
                    View LinkedIn
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>

          {/* Linked Lead */}
          {contact.lead && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">Linked Lead</h3>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/leads/${contact.lead.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-dark-800 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <CheckIcon className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-primary-400">{contact.lead.name}</p>
                    <p className="text-sm text-dark-500">Status: {contact.lead.status}</p>
                  </div>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Contact" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name *"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <Input
              label="Role"
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
            />
            <Input
              label="Phone"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
            <Input
              label="LinkedIn URL"
              value={editForm.linkedinUrl}
              onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
            />
            <Input
              label="Location"
              value={editForm.location}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
            />
          </div>
          <Input
            label="Next Action"
            value={editForm.nextAction}
            onChange={(e) => setEditForm({ ...editForm, nextAction: e.target.value })}
            placeholder="e.g., Comment on their latest post"
          />
          <Input
            label="Next Action Due"
            type="datetime-local"
            value={editForm.nextActionDue}
            onChange={(e) => setEditForm({ ...editForm, nextActionDue: e.target.value })}
          />
          <Input
            label="Tags"
            value={editForm.tags}
            onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
            hint="Comma-separated"
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

      {/* Add Interaction Modal */}
      <Modal
        isOpen={isInteractionModalOpen}
        onClose={() => setIsInteractionModalOpen(false)}
        title="Add Interaction"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              options={interactionTypeOptions}
              value={interactionForm.type}
              onChange={(e) =>
                setInteractionForm({ ...interactionForm, type: e.target.value })
              }
            />
            <Select
              label="Direction"
              options={directionOptions}
              value={interactionForm.direction}
              onChange={(e) =>
                setInteractionForm({ ...interactionForm, direction: e.target.value })
              }
            />
          </div>
          <Textarea
            label="Description *"
            value={interactionForm.description}
            onChange={(e) =>
              setInteractionForm({ ...interactionForm, description: e.target.value })
            }
            placeholder="What happened in this interaction?"
            rows={3}
          />
          <Input
            label="URL (optional)"
            value={interactionForm.url}
            onChange={(e) =>
              setInteractionForm({ ...interactionForm, url: e.target.value })
            }
            placeholder="https://linkedin.com/posts/..."
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setIsInteractionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddInteraction}
              isLoading={interactionMutation.isPending}
              disabled={!interactionForm.description.trim()}
            >
              Add Interaction
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Contact" size="sm">
        <p className="text-dark-400 mb-6">
          Are you sure you want to delete this contact? All interactions will be removed. This action cannot be undone.
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
function formatWarmth(warmth: string): string {
  const labels: Record<string, string> = { cold: 'Cold', warm: 'Warm', hot: 'Hot' };
  return labels[warmth] || warmth;
}

function getWarmthBadgeVariant(warmth: string): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  return ({ cold: 'info', warm: 'warning', hot: 'danger' } as Record<string, 'info' | 'warning' | 'danger'>)[warmth] || 'default';
}

function formatSource(source: string | null): string {
  if (!source) return '';
  const labels: Record<string, string> = {
    linkedin_search: 'LinkedIn Search',
    linkedin_post_engagement: 'LinkedIn Post',
    linkedin_comment: 'LinkedIn Comment',
    referral: 'Referral',
    event: 'Event',
    cold_outreach: 'Cold Outreach',
    inbound_converted: 'Inbound Converted',
    other: 'Other',
  };
  return labels[source] || source;
}

function formatInteractionType(type: string): string {
  const labels: Record<string, string> = {
    linkedin_comment: 'Comment',
    linkedin_like: 'Like',
    linkedin_dm_sent: 'DM Sent',
    linkedin_dm_received: 'DM Received',
    linkedin_connection_sent: 'Connection Sent',
    linkedin_connection_accepted: 'Connection Accepted',
    linkedin_post_engagement: 'Post Engagement',
    email_sent: 'Email Sent',
    email_received: 'Email Received',
    call: 'Call',
    meeting: 'Meeting',
    note: 'Note',
  };
  return labels[type] || type;
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
