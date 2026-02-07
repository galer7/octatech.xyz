import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";

export function LoginPage() {
	const { user, login, isLoading, error, clearError } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(false);

	// If already logged in, redirect to dashboard
	if (user) {
		return <Navigate to="/" replace />;
	}

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		clearError();

		try {
			await login(email, password, rememberMe);
			navigate("/");
		} catch {
			// Error is handled by the auth context
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				{/* Logo */}
				<div className="flex justify-center mb-8">
					<div className="flex items-center gap-3">
						<div className="h-12 w-12 rounded-xl bg-primary-500 flex items-center justify-center">
							<span className="text-white font-bold text-xl">O</span>
						</div>
						<div>
							<h1 className="text-2xl font-bold">Octatech</h1>
							<p className="text-sm text-dark-400">CRM Admin</p>
						</div>
					</div>
				</div>

				{/* Login Form */}
				<div className="bg-dark-900 border border-dark-800 rounded-xl p-8">
					<h2 className="text-xl font-semibold mb-6 text-center">Sign in to your account</h2>

					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
								{error}
							</div>
						)}

						<Input
							label="Email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="admin@octatech.xyz"
							required
							autoComplete="email"
							autoFocus
						/>

						<Input
							label="Password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Enter your password"
							required
							autoComplete="current-password"
						/>

						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="rememberMe"
								checked={rememberMe}
								onChange={(e) => setRememberMe(e.target.checked)}
								className="h-4 w-4 rounded border-dark-700 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-950"
							/>
							<label htmlFor="rememberMe" className="text-sm text-dark-400">
								Remember me for 30 days
							</label>
						</div>

						<Button type="submit" className="w-full" isLoading={isLoading}>
							Sign in
						</Button>
					</form>
				</div>

				<p className="text-center text-sm text-dark-500 mt-6">
					Octatech CRM &copy; {new Date().getFullYear()}
				</p>
			</div>
		</div>
	);
}
