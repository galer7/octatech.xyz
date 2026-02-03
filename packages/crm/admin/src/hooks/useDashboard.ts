import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Lead, LeadStatus } from '@/lib/types';

interface DashboardData {
  stats: {
    total: number;
    byStatus: Record<LeadStatus, number>;
  };
  recentLeads: Lead[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      // Fetch both stats and recent leads
      const [leadsResponse, recentResponse] = await Promise.all([
        api.get<{ data: Lead[]; pagination: { total: number } }>('/v1/leads', { limit: 1000 }),
        api.get<{ data: Lead[] }>('/v1/leads', { limit: 5, sort: 'createdAt', order: 'desc' }),
      ]);

      // Calculate stats from leads
      const leads = leadsResponse.data;
      const byStatus: Record<LeadStatus, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        proposal: 0,
        won: 0,
        lost: 0,
      };

      for (const lead of leads) {
        if (lead.status in byStatus) {
          byStatus[lead.status]++;
        }
      }

      const data: DashboardData = {
        stats: {
          total: leadsResponse.pagination.total,
          byStatus,
        },
        recentLeads: recentResponse.data,
      };

      return data;
    },
    staleTime: 30000, // 30 seconds
  });
}
