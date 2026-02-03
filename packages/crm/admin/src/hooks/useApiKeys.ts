import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiKey, ApiKeyScope } from '@/lib/types';

export function useApiKeys(includeRevoked = false) {
  return useQuery({
    queryKey: ['apiKeys', { includeRevoked }],
    queryFn: async () => {
      const response = await api.get<{ keys: ApiKey[] }>('/admin/api-keys', {
        includeRevoked,
      });
      return response.keys;
    },
  });
}

export function useApiKeyScopes() {
  return useQuery({
    queryKey: ['apiKeyScopes'],
    queryFn: async () => {
      const response = await api.get<{ scopes: ApiKeyScope[] }>('/admin/api-keys/scopes/list');
      return response.scopes;
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, scopes }: { name: string; scopes: string[] }) => {
      const response = await api.post<ApiKey & { key: string }>('/admin/api-keys', {
        name,
        scopes,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
}

export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; scopes?: string[] };
    }) => {
      const response = await api.patch<ApiKey>(`/admin/api-keys/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/api-keys/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
    },
  });
}
