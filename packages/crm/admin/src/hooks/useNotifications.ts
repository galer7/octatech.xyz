import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NotificationChannel, NotificationChannelType } from "@/lib/types";

export function useNotificationChannels() {
	return useQuery({
		queryKey: ["notifications"],
		queryFn: async () => {
			const response = await api.get<{ channels: NotificationChannel[] }>("/admin/notifications");
			return response.channels;
		},
	});
}

export function useNotificationEvents() {
	return useQuery({
		queryKey: ["notificationEvents"],
		queryFn: async () => {
			const response = await api.get<{ events: { event: string; description: string }[] }>(
				"/admin/notifications/events/list",
			);
			return response.events;
		},
	});
}

export function useNotificationTypes() {
	return useQuery({
		queryKey: ["notificationTypes"],
		queryFn: async () => {
			const response = await api.get<{
				types: {
					type: NotificationChannelType;
					name: string;
					configHints: Record<string, string>;
				}[];
			}>("/admin/notifications/types/list");
			return response.types;
		},
	});
}

export function useCreateNotificationChannel() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: {
			type: NotificationChannelType;
			name: string;
			config: Record<string, string>;
			events: string[];
			enabled?: boolean;
		}) => {
			const response = await api.post<{ channel: NotificationChannel }>(
				"/admin/notifications",
				data,
			);
			return response.channel;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});
}

export function useUpdateNotificationChannel() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string;
			data: Partial<{
				name: string;
				config: Record<string, string>;
				events: string[];
				enabled: boolean;
			}>;
		}) => {
			const response = await api.patch<{ channel: NotificationChannel }>(
				`/admin/notifications/${id}`,
				data,
			);
			return response.channel;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});
}

export function useDeleteNotificationChannel() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/admin/notifications/${id}`);
			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});
}

export function useTestNotificationChannel() {
	return useMutation({
		mutationFn: async (id: string) => {
			const response = await api.post<{ success: boolean; message: string }>(
				`/admin/notifications/${id}/test`,
			);
			return response;
		},
	});
}
