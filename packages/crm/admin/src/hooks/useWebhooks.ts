import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Webhook, WebhookDelivery } from '@/lib/types';

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const response = await api.get<{ webhooks: Webhook[] }>('/admin/webhooks');
      return response.webhooks;
    },
  });
}

export function useWebhook(id: string | undefined) {
  return useQuery({
    queryKey: ['webhook', id],
    queryFn: async () => {
      if (!id) throw new Error('Webhook ID required');
      const response = await api.get<{ webhook: Webhook }>(`/admin/webhooks/${id}`);
      return response.webhook;
    },
    enabled: !!id,
  });
}

export function useWebhookDeliveries(webhookId: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['webhookDeliveries', webhookId, page, limit],
    queryFn: async () => {
      if (!webhookId) throw new Error('Webhook ID required');
      const response = await api.get<{
        deliveries: WebhookDelivery[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/admin/webhooks/${webhookId}/deliveries`, { page, limit });
      return response;
    },
    enabled: !!webhookId,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      url: string;
      events: string[];
      secret?: string;
      enabled?: boolean;
    }) => {
      const response = await api.post<{ webhook: Webhook }>('/admin/webhooks', data);
      return response.webhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        url: string;
        events: string[];
        secret: string;
        enabled: boolean;
      }>;
    }) => {
      const response = await api.patch<{ webhook: Webhook }>(`/admin/webhooks/${id}`, data);
      return response.webhook;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['webhook', variables.id] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/webhooks/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post<{ success: boolean; statusCode: number; responseTime: number }>(
        `/admin/webhooks/${id}/test`
      );
      return response;
    },
  });
}
