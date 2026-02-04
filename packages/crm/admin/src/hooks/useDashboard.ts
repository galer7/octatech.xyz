import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LeadStatus } from '@/lib/types';

/**
 * Recent lead data returned by the dashboard stats endpoint.
 */
interface RecentLead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  createdAt: string;
}

/**
 * Recent activity data returned by the dashboard stats endpoint.
 */
interface RecentActivity {
  id: string;
  leadId: string;
  leadName: string;
  type: string;
  description: string;
  createdAt: string;
}

/**
 * Dashboard data returned by the optimized stats endpoint.
 */
interface DashboardData {
  stats: {
    total: number;
    byStatus: Record<LeadStatus, number>;
  };
  recentLeads: RecentLead[];
  recentActivity: RecentActivity[];
}

/**
 * Hook to fetch dashboard statistics.
 *
 * Uses the dedicated /api/admin/dashboard/stats endpoint which performs
 * efficient SQL aggregation on the server side, avoiding the need to
 * fetch all leads to calculate status counts client-side.
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      // Use the dedicated dashboard stats endpoint for efficient aggregation
      const response = await api.get<DashboardData>('/admin/dashboard/stats');
      return response;
    },
    staleTime: 30000, // 30 seconds
  });
}
