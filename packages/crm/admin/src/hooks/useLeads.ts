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

/**
 * Response wrapper types matching the backend admin API format.
 * Admin endpoints wrap single objects in { data: T }.
 */
interface ApiResponse<T> {
  data: T;
}

/**
 * Fetch paginated list of leads.
 *
 * Uses /admin/leads endpoint with session-based authentication.
 * The admin API returns { data: Lead[], pagination: {...} }.
 */
export function useLeads(params: LeadsQueryParams = {}) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Lead>>(
        '/admin/leads',
        params as Record<string, string | number | boolean | undefined>
      );
      return response;
    },
  });
}

/**
 * Fetch a single lead with its activity history.
 *
 * Uses /admin/leads/:id endpoint with session-based authentication.
 * Returns the lead with activities array attached.
 */
export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      if (!id) throw new Error('Lead ID required');
      const response = await api.get<ApiResponse<LeadWithActivities>>(`/admin/leads/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

/**
 * Create a new lead.
 *
 * Uses /admin/leads endpoint with session-based authentication.
 * Invalidates leads list and dashboard caches on success.
 */
export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Lead>) => {
      const response = await api.post<ApiResponse<Lead>>('/admin/leads', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Update an existing lead.
 *
 * Uses /admin/leads/:id endpoint with session-based authentication.
 * Invalidates leads list, single lead, and dashboard caches on success.
 */
export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const response = await api.patch<ApiResponse<Lead>>(`/admin/leads/${id}`, data);
      return response.data;
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Delete a lead.
 *
 * Uses /admin/leads/:id endpoint with session-based authentication.
 * Invalidates leads list and dashboard caches on success.
 */
export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/leads/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Add an activity (note, call, email, meeting) to a lead.
 *
 * Uses /admin/leads/:id/activities endpoint with session-based authentication.
 * Invalidates the single lead cache on success to refresh activity list.
 */
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
      const response = await api.post<ApiResponse<Activity>>(
        `/admin/leads/${leadId}/activities`,
        { type, description }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead', variables.leadId] });
    },
  });
}

/**
 * Parse unstructured text into lead data using AI.
 *
 * Uses /admin/leads/parse endpoint with session-based authentication.
 * Can optionally auto-save the lead if autoSave is true (requires name and email).
 */
export function useParseLead() {
  const queryClient = useQueryClient();

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
        };
        confidence: number;
        extractedFields: string[];
        lead?: Lead;
      }>('/admin/leads/parse', { text, autoSave });
      return response;
    },
    onSuccess: (data) => {
      // If a lead was created via autoSave, invalidate caches
      if (data.lead) {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    },
  });
}
