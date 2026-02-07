import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Company, CompanyWithContacts, PaginatedResponse } from "@/lib/types";

interface CompaniesQueryParams {
	page?: number;
	limit?: number;
	search?: string;
	size?: string;
	contractType?: string;
	hiringContractors?: boolean;
	sort?: string;
}

/**
 * Response wrapper types matching the backend admin API format.
 * Admin endpoints wrap single objects in { data: T }.
 */
interface ApiResponse<T> {
	data: T;
}

/**
 * Fetch paginated list of companies.
 *
 * Uses /admin/companies endpoint with session-based authentication.
 * The admin API returns { data: Company[], pagination: {...} }.
 */
export function useCompanies(params: CompaniesQueryParams = {}) {
	return useQuery({
		queryKey: ["companies", params],
		queryFn: async () => {
			const response = await api.get<PaginatedResponse<Company>>(
				"/admin/companies",
				params as Record<string, string | number | boolean | undefined>,
			);
			return response;
		},
	});
}

/**
 * Fetch a single company with its contacts.
 *
 * Uses /admin/companies/:id endpoint with session-based authentication.
 * Returns the company with contacts array attached.
 */
export function useCompany(id: string | undefined) {
	return useQuery({
		queryKey: ["company", id],
		queryFn: async () => {
			if (!id) throw new Error("Company ID required");
			const response = await api.get<ApiResponse<CompanyWithContacts>>(`/admin/companies/${id}`);
			return response.data;
		},
		enabled: !!id,
	});
}

/**
 * Create a new company.
 *
 * Uses /admin/companies endpoint with session-based authentication.
 * Invalidates companies list cache on success.
 */
export function useCreateCompany() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: Partial<Company>) => {
			const response = await api.post<ApiResponse<Company>>("/admin/companies", data);
			return response.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["companies"] });
		},
	});
}

/**
 * Update an existing company.
 *
 * Uses /admin/companies/:id endpoint with session-based authentication.
 * Invalidates companies list and single company caches on success.
 */
export function useUpdateCompany() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, data }: { id: string; data: Partial<Company> }) => {
			const response = await api.patch<ApiResponse<Company>>(`/admin/companies/${id}`, data);
			return response.data;
		},
		onSuccess: (company) => {
			queryClient.invalidateQueries({ queryKey: ["companies"] });
			queryClient.invalidateQueries({ queryKey: ["company", company.id] });
		},
	});
}

/**
 * Delete a company.
 *
 * Uses /admin/companies/:id endpoint with session-based authentication.
 * Invalidates companies list cache on success.
 */
export function useDeleteCompany() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			await api.delete(`/admin/companies/${id}`);
			return id;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["companies"] });
		},
	});
}
