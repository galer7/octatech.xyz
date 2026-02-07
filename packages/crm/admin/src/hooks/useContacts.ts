import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
	Contact,
	ContactInteraction,
	ContactParseResult,
	ContactWithDetails,
	PaginatedResponse,
} from "@/lib/types";

interface ContactsQueryParams {
	page?: number;
	limit?: number;
	search?: string;
	relationshipStatus?: string;
	warmth?: string;
	tier?: string;
	companyId?: string;
	followUpDue?: boolean;
	sort?: string;
}

interface InteractionsQueryParams {
	page?: number;
	limit?: number;
	type?: string;
}

/**
 * Response wrapper types matching the backend admin API format.
 * Admin endpoints wrap single objects in { data: T }.
 */
interface ApiResponse<T> {
	data: T;
}

/**
 * Fetch paginated list of contacts.
 *
 * Uses /admin/contacts endpoint with session-based authentication.
 * The admin API returns { data: Contact[], pagination: {...} }.
 */
export function useContacts(params: ContactsQueryParams = {}) {
	return useQuery({
		queryKey: ["contacts", params],
		queryFn: async () => {
			const response = await api.get<PaginatedResponse<Contact>>(
				"/admin/contacts",
				params as Record<string, string | number | boolean | undefined>,
			);
			return response;
		},
	});
}

/**
 * Fetch a single contact with full details.
 *
 * Uses /admin/contacts/:id endpoint with session-based authentication.
 * Returns the contact with company, lead, and interactions attached.
 */
export function useContact(id: string | undefined) {
	return useQuery({
		queryKey: ["contact", id],
		queryFn: async () => {
			if (!id) throw new Error("Contact ID required");
			const response = await api.get<ApiResponse<ContactWithDetails>>(`/admin/contacts/${id}`);
			return response.data;
		},
		enabled: !!id,
	});
}

/**
 * Create a new contact.
 *
 * Uses /admin/contacts endpoint with session-based authentication.
 * Invalidates contacts list cache on success.
 */
export function useCreateContact() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: Partial<Contact>) => {
			const response = await api.post<ApiResponse<Contact>>("/admin/contacts", data);
			return response.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		},
	});
}

/**
 * Update an existing contact.
 *
 * Uses /admin/contacts/:id endpoint with session-based authentication.
 * Invalidates contacts list and single contact caches on success.
 */
export function useUpdateContact() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, data }: { id: string; data: Partial<Contact> }) => {
			const response = await api.patch<ApiResponse<Contact>>(`/admin/contacts/${id}`, data);
			return response.data;
		},
		onSuccess: (contact) => {
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
			queryClient.invalidateQueries({ queryKey: ["contact", contact.id] });
		},
	});
}

/**
 * Delete a contact.
 *
 * Uses /admin/contacts/:id endpoint with session-based authentication.
 * Invalidates contacts list cache on success.
 */
export function useDeleteContact() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/admin/contacts/${id}`);
			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		},
	});
}

/**
 * Log a new interaction for a contact.
 *
 * Uses /admin/contacts/:id/interactions endpoint with session-based authentication.
 * Invalidates contact detail, contacts list, and interactions caches on success.
 */
export function useCreateInteraction(contactId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: Partial<ContactInteraction>) => {
			const response = await api.post<ApiResponse<ContactInteraction>>(
				`/admin/contacts/${contactId}/interactions`,
				data,
			);
			return response.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
			queryClient.invalidateQueries({
				queryKey: ["contactInteractions", contactId],
			});
		},
	});
}

/**
 * Fetch paginated list of interactions for a contact.
 *
 * Uses /admin/contacts/:id/interactions endpoint with session-based authentication.
 * The admin API returns { data: ContactInteraction[], pagination: {...} }.
 */
export function useContactInteractions(
	contactId: string | undefined,
	params: InteractionsQueryParams = {},
) {
	return useQuery({
		queryKey: ["contactInteractions", contactId, params],
		queryFn: async () => {
			if (!contactId) throw new Error("Contact ID required");
			const response = await api.get<PaginatedResponse<ContactInteraction>>(
				`/admin/contacts/${contactId}/interactions`,
				params as Record<string, string | number | boolean | undefined>,
			);
			return response;
		},
		enabled: !!contactId,
	});
}

/**
 * Parse contact information from unstructured text using AI.
 *
 * Uses /admin/contacts/parse endpoint with session-based authentication.
 * Invalidates contacts list cache on success.
 */
export function useParseContact() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: { text: string; autoSave?: boolean }) => {
			const response = await api.post<ApiResponse<ContactParseResult>>(
				"/admin/contacts/parse",
				data,
			);
			return response.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["contacts"] });
		},
	});
}
