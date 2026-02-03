import { Link } from 'react-router-dom';
import { useDashboard } from '@/hooks/useDashboard';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatRelativeTime, formatStatus, getStatusClass, cn } from '@/lib/utils';
import type { LeadStatus } from '@/lib/types';

const statusOrder: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
        Failed to load dashboard data. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-dark-400 mt-1">Overview of your CRM activity</p>
        </div>
        <div className="flex gap-3">
          <Link to="/leads/new">
            <Button variant="secondary">
              <PlusIcon className="h-4 w-4" />
              Add Lead
            </Button>
          </Link>
          <Link to="/leads/ai">
            <Button>
              <SparklesIcon className="h-4 w-4" />
              AI Add
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statusOrder.map((status) => (
          <Link
            key={status}
            to={`/leads?status=${status}`}
            className="block"
          >
            <Card className="hover:border-dark-700 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-medium uppercase tracking-wide', `text-${getStatusColor(status)}`)}>
                    {formatStatus(status)}
                  </span>
                </div>
                <div className="mt-2 text-3xl font-bold">
                  {data?.stats.byStatus[status] || 0}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Total Leads Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm">Total Leads</p>
              <p className="text-4xl font-bold mt-1">{data?.stats.total || 0}</p>
            </div>
            <div className="h-16 w-16 rounded-full bg-primary-500/10 flex items-center justify-center">
              <UsersIcon className="h-8 w-8 text-primary-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Leads</h2>
            <Link to="/leads" className="text-sm text-primary-400 hover:text-primary-300">
              View all
            </Link>
          </div>
        </CardHeader>
        <div className="divide-y divide-dark-800">
          {data?.recentLeads.length === 0 ? (
            <div className="p-6 text-center text-dark-500">
              No leads yet. Add your first lead to get started.
            </div>
          ) : (
            data?.recentLeads.map((lead) => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-center justify-between p-4 hover:bg-dark-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-dark-800 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {lead.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-sm text-dark-400">{lead.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge className={getStatusClass(lead.status)}>
                    {formatStatus(lead.status)}
                  </Badge>
                  <span className="text-sm text-dark-500">
                    {formatRelativeTime(lead.createdAt)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function getStatusColor(status: LeadStatus): string {
  const colors: Record<LeadStatus, string> = {
    new: 'blue-400',
    contacted: 'yellow-400',
    qualified: 'purple-400',
    proposal: 'indigo-400',
    won: 'green-400',
    lost: 'red-400',
  };
  return colors[status];
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
