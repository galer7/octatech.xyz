import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	error?: string;
	hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ className, label, error, hint, id, ...props }, ref) => {
		const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

		return (
			<div className="space-y-1.5">
				{label && (
					<label htmlFor={inputId} className="block text-sm font-medium text-dark-300">
						{label}
					</label>
				)}
				<input
					ref={ref}
					id={inputId}
					className={cn(
						"w-full px-3 py-2 bg-dark-800 border rounded-lg text-dark-100 placeholder-dark-500",
						"focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						error ? "border-red-500" : "border-dark-700",
						className,
					)}
					{...props}
				/>
				{error && <p className="text-sm text-red-400">{error}</p>}
				{hint && !error && <p className="text-sm text-dark-500">{hint}</p>}
			</div>
		);
	},
);

Input.displayName = "Input";
