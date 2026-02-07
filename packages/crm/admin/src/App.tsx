import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { ApiKeysPage } from "@/pages/ApiKeysPage";
import { CompaniesPage } from "@/pages/CompaniesPage";
import { CompanyDetailPage } from "@/pages/CompanyDetailPage";
import { ContactAIPage } from "@/pages/ContactAIPage";
import { ContactDetailPage } from "@/pages/ContactDetailPage";
import { ContactsPage } from "@/pages/ContactsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LeadAIPage } from "@/pages/LeadAIPage";
import { LeadDetailPage } from "@/pages/LeadDetailPage";
import { LeadNewPage } from "@/pages/LeadNewPage";
import { LeadsPage } from "@/pages/LeadsPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WebhookDeliveriesPage } from "@/pages/WebhookDeliveriesPage";
import { WebhooksPage } from "@/pages/WebhooksPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
			</div>
		);
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	return <>{children}</>;
}

function AppRoutes() {
	return (
		<Routes>
			<Route path="/login" element={<LoginPage />} />
			<Route
				path="/"
				element={
					<ProtectedRoute>
						<Layout />
					</ProtectedRoute>
				}
			>
				<Route index element={<DashboardPage />} />
				<Route path="leads" element={<LeadsPage />} />
				<Route path="leads/new" element={<LeadNewPage />} />
				<Route path="leads/ai" element={<LeadAIPage />} />
				<Route path="leads/:id" element={<LeadDetailPage />} />
				<Route path="contacts" element={<ContactsPage />} />
				<Route path="contacts/ai" element={<ContactAIPage />} />
				<Route path="contacts/:id" element={<ContactDetailPage />} />
				<Route path="companies" element={<CompaniesPage />} />
				<Route path="companies/:id" element={<CompanyDetailPage />} />
				<Route path="api-keys" element={<ApiKeysPage />} />
				<Route path="webhooks" element={<WebhooksPage />} />
				<Route path="webhooks/:id/deliveries" element={<WebhookDeliveriesPage />} />
				<Route path="notifications" element={<NotificationsPage />} />
				<Route path="settings" element={<SettingsPage />} />
			</Route>
			<Route path="*" element={<Navigate to="/" replace />} />
		</Routes>
	);
}

export function App() {
	return (
		<AuthProvider>
			<AppRoutes />
		</AuthProvider>
	);
}
