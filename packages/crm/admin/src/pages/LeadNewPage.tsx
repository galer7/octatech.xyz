import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateLead } from '@/hooks/useLeads';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

const budgetOptions = [
  { value: '', label: 'Select budget range' },
  { value: 'under_10k', label: 'Under $10k' },
  { value: '10k_25k', label: '$10k - $25k' },
  { value: '25k_50k', label: '$25k - $50k' },
  { value: '50k_100k', label: '$50k - $100k' },
  { value: '100k_250k', label: '$100k - $250k' },
  { value: '250k_plus', label: '$250k+' },
];

const projectTypeOptions = [
  { value: '', label: 'Select project type' },
  { value: 'new_product', label: 'New Product / MVP' },
  { value: 'existing_product', label: 'Existing Product Enhancement' },
  { value: 'maintenance', label: 'Maintenance & Support' },
  { value: 'consulting', label: 'Technical Consulting' },
  { value: 'staff_augmentation', label: 'Staff Augmentation' },
  { value: 'other', label: 'Other' },
];

const sourceOptions = [
  { value: '', label: 'Select source' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google', label: 'Google Search' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

export function LeadNewPage() {
  const navigate = useNavigate();
  const createMutation = useCreateLead();

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    budget: '',
    projectType: '',
    source: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      const lead = await createMutation.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim() || null,
        phone: form.phone.trim() || null,
        budget: form.budget || null,
        projectType: form.projectType || null,
        source: form.source || null,
        message: form.message.trim() || null,
      } as any);
      navigate(`/leads/${lead.id}`);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/leads"
          className="p-2 text-dark-400 hover:text-dark-100 rounded-lg hover:bg-dark-800 transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Lead</h1>
          <p className="text-dark-400 mt-1">Manually enter lead information</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={errors.name}
                placeholder="John Doe"
              />
              <Input
                label="Email *"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={errors.email}
                placeholder="john@example.com"
              />
              <Input
                label="Company"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Acme Inc."
              />
              <Input
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555-123-4567"
              />
              <Select
                label="Budget"
                options={budgetOptions}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
              />
              <Select
                label="Project Type"
                options={projectTypeOptions}
                value={form.projectType}
                onChange={(e) => setForm({ ...form, projectType: e.target.value })}
              />
              <Select
                label="Source"
                options={sourceOptions}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <Textarea
              label="Message"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Additional details about the lead..."
              rows={4}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Link to="/leads">
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" isLoading={createMutation.isPending}>
                Create Lead
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}
