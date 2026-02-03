import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Lead, Activity, PaginatedResponse, LeadStatus } from '@/lib/types';

interface LeadsQueryParams {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface LeadWithActivities extends Lead {
  activities: Activity[];
}

export function useLeads(params: LeadsQueryParams = {}) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Lead>>('/v1/leads', params as Record<string, string | number | boolean | undefined>);
      return response;
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      if (!id) throw new Error('Lead ID required');
      const response = await api.get<{ lead: LeadWithActivities }>(`/v1/leads/${id}`);
      return response.lead;
    },
    enabled: !!id,
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Lead>) => {
      const response = await api.post<{ lead: Lead }>('/v1/leads', data);
      return response.lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const response = await api.patch<{ lead: Lead }>(`/v1/leads/${id}`, data);
      return response.lead;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/v1/leads/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      type,
      description,
    }: {
      leadId: string;
      type: string;
      description: string;
    }) => {
      const response = await api.post<{ activity: Activity }>(
        `/v1/leads/${leadId}/activities`,
        { type, description }
      );
      return response.activity;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] });
    },
  });
}

export function useParseLead() {
  return useMutation({
    mutationFn: async ({ text, autoSave }: { text: string; autoSave?: boolean }) => {
      const response = await api.post<{
        parsed: {
          name: string | null;
          email: string | null;
          company: string | null;
          phone: string | null;
          budget: string | null;
          projectType: string | null;
          message: string | null;
          source: string | null;
          confidence: number;
          extractedFields: string[];
        };
        lead?: Lead;
      }>('/v1/leads/parse', { text, autoSave });
      return response;
    },
  });
}
