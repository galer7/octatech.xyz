import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCompanies, useCreateCompany, useDeleteCompany } from '@/hooks/useCompanies';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { formatRelativeTime } from '@/lib/utils';
import type { CompanySize, CompanyContractType } from '@/lib/types';

const sizeOptions = [
  { value: '', label: 'All Sizes' },
  { value: 'solo', label: 'Solo' },
  { value: 'startup', label: 'Startup' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'enterprise', label: 'Enterprise' },
];

const contractTypeOptions = [
  { value: '', label: 'All Contract Types' },
  { value: 'b2b', label: 'B2B' },
  { value: 'employment', label: 'Employment' },
  { value: 'both', label: 'Both' },
  { value: 'unknown', label: 'Unknown' },
];

const hiringOptions = [
  { value: '', label: 'All Hiring' },
  { value: 'true', label: 'Hiring Contractors' },
  { value: 'false', label: 'Not Hiring' },
];

const sortOptions = [
  { value: 'name:asc', label: 'Name A-Z' },
  { value: 'name:desc', label: 'Name Z-A' },
  { value: 'createdAt:desc', label: 'Newest First' },
  { value: 'createdAt:asc', label: 'Oldest First' },
];

const sizeFormOptions = [
  { value: '', label: 'Not specified' },
  { value: 'solo', label: 'Solo' },
  { value: 'startup', label: 'Startup (2-10)' },
  { value: 'small', label: 'Small (11-50)' },
  { value: 'medium', label: 'Medium (51-200)' },
  { value: 'large', label: 'Large (201-1000)' },
  { value: 'enterprise', label: 'Enterprise (1000+)' },
];

const contractTypeFormOptions = [
  { value: '', label: 'Not specified' },
  { value: 'b2b', label: 'B2B' },
  { value: 'employment', label: 'Employment' },
  { value: 'both', label: 'Both' },
  { value: 'unknown', label: 'Unknown' },
];

const hiringFormOptions = [
  { value: '', label: 'Not specified' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export function CompaniesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    industry: '',
    size: '' as CompanySize | '',
    location: '',
    website: '',
    linkedinUrl: '',
    contractType: '' as CompanyContractType | '',
    hiringContractors: '' as '' | 'true' | 'false',
    notes: '',
    tags: '',
  });

  const size = searchParams.get('size') || '';
  const contractType = searchParams.get('contractType') || '';
  const hiringContractors = searchParams.get('hiringContractors') || '';
  const sortParam = searchParams.get('sort') || 'name:asc';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const { data, isLoading, error } = useCompanies({
    page,
    limit: 20,
    search: search || undefined,
    size: size || undefined,
    contractType: contractType || undefined,
    hiringContractors: hiringContractors ? hiringContractors === 'true' : undefined,
    sort: sortParam,
  });

  const deleteMutation = useDeleteCompany();
  const createMutation = useCreateCompany();

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
    if (!('page' in updates)) {
      newParams.delete('page');
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

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        name: createForm.name,
        industry: createForm.industry || null,
        size: (createForm.size || null) as CompanySize | null,
        location: createForm.location || null,
        website: createForm.website || null,
        linkedinUrl: createForm.linkedinUrl || null,
        contractType: (createForm.contractType || null) as CompanyContractType | null,
        hiringContractors:
          createForm.hiringContractors === ''
            ? null
            : createForm.hiringContractors === 'true',
        notes: createForm.notes || null,
        tags: createForm.tags
          ? createForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
      });
      setIsCreateModalOpen(false);
      setCreateForm({
        name: '',
        industry: '',
        size: '',
        location: '',
        website: '',
        linkedinUrl: '',
        contractType: '',
        hiringContractors: '',
        notes: '',
        tags: '',
      });
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-dark-400 mt-1">
            {data?.pagination.total ?? 0} total companies
          </p>
        </div>
        <Button variant="secondary" onClick={() => setIsCreateModalOpen(true)}>
          <PlusIcon className="h-4 w-4" />
          Add Company
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search companies..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <div className="w-36">
            <Select
              options={sizeOptions}
              value={size}
              onChange={(e) => updateParams({ size: e.target.value || undefined })}
            />
          </div>
          <div className="w-44">
            <Select
              options={contractTypeOptions}
              value={contractType}
              onChange={(e) => updateParams({ contractType: e.target.value || undefined })}
            />
          </div>
          <div className="w-44">
            <Select
              options={hiringOptions}
              value={hiringContractors}
              onChange={(e) => updateParams({ hiringContractors: e.target.value || undefined })}
            />
          </div>
          <div className="w-40">
            <Select
              options={sortOptions}
              value={sortParam}
              onChange={(e) => updateParams({ sort: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* Companies Table */}
      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400">
            Failed to load companies. Please try again.
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-12 text-center">
            <BuildingIcon className="h-12 w-12 mx-auto text-dark-600" />
            <p className="mt-4 text-dark-400">No companies found</p>
            <p className="text-sm text-dark-500 mt-1">
              {search || size || contractType || hiringContractors
                ? 'Try adjusting your filters'
                : 'Add your first company to get started'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-800">
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Name</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Industry</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Size</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Location</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Contract Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Hiring</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Contacts</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-dark-400">Created</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-dark-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {data?.data.map((company) => (
                    <tr key={company.id} className="hover:bg-dark-800/50 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          to={`/companies/${company.id}`}
                          className="font-medium hover:text-primary-400 transition-colors"
                        >
                          {company.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-dark-400">{company.industry || '-'}</td>
                      <td className="py-3 px-4">
                        {company.size ? (
                          <Badge>{formatSize(company.size)}</Badge>
                        ) : (
                          <span className="text-dark-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-dark-400">{company.location || '-'}</td>
                      <td className="py-3 px-4">
                        {company.contractType ? (
                          <Badge variant={getContractTypeBadgeVariant(company.contractType)}>
                            {formatContractType(company.contractType)}
                          </Badge>
                        ) : (
                          <span className="text-dark-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {company.hiringContractors === true ? (
                          <Badge variant="success">Yes</Badge>
                        ) : company.hiringContractors === false ? (
                          <Badge variant="danger">No</Badge>
                        ) : (
                          <span className="text-dark-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-dark-400">
                        {company.contactCount ?? 0}
                      </td>
                      <td className="py-3 px-4 text-dark-400 text-sm">
                        {formatRelativeTime(company.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/companies/${company.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(company.id)}
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

      {/* Create Company Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add Company"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Name"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
            <Input
              label="Industry"
              value={createForm.industry}
              onChange={(e) => setCreateForm({ ...createForm, industry: e.target.value })}
            />
            <Select
              label="Size"
              options={sizeFormOptions}
              value={createForm.size}
              onChange={(e) =>
                setCreateForm({ ...createForm, size: e.target.value as CompanySize | '' })
              }
            />
            <Input
              label="Location"
              value={createForm.location}
              onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })}
            />
            <Input
              label="Website"
              value={createForm.website}
              onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })}
              placeholder="https://example.com"
            />
            <Input
              label="LinkedIn URL"
              value={createForm.linkedinUrl}
              onChange={(e) => setCreateForm({ ...createForm, linkedinUrl: e.target.value })}
              placeholder="https://linkedin.com/company/..."
            />
            <Select
              label="Contract Type"
              options={contractTypeFormOptions}
              value={createForm.contractType}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  contractType: e.target.value as CompanyContractType | '',
                })
              }
            />
            <Select
              label="Hiring Contractors"
              options={hiringFormOptions}
              value={createForm.hiringContractors}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  hiringContractors: e.target.value as '' | 'true' | 'false',
                })
              }
            />
          </div>
          <Input
            label="Tags"
            value={createForm.tags}
            onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
            hint="Comma-separated (e.g., fintech, remote, series-b)"
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
              Create Company
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Company"
        size="sm"
      >
        <p className="text-dark-400 mb-6">
          Are you sure you want to delete this company? This action cannot be undone.
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

// Helpers
function formatSize(size: string): string {
  const labels: Record<string, string> = {
    solo: 'Solo',
    startup: 'Startup',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    enterprise: 'Enterprise',
  };
  return labels[size] || size;
}

function formatContractType(contractType: string): string {
  const labels: Record<string, string> = {
    b2b: 'B2B',
    employment: 'Employment',
    both: 'Both',
    unknown: 'Unknown',
  };
  return labels[contractType] || contractType;
}

function getContractTypeBadgeVariant(
  contractType: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const variants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
    b2b: 'info',
    employment: 'success',
    both: 'warning',
    unknown: 'default',
  };
  return variants[contractType] || 'default';
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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
