import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
	label?: string;
	error?: string;
	options: { value: string; label: string }[];
	placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
	({ className, label, error, options, placeholder, id, ...props }, ref) => {
		const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

		return (
			<div className="space-y-1.5">
				{label && (
					<label htmlFor={selectId} className="block text-sm font-medium text-dark-300">
						{label}
					</label>
				)}
				<select
					ref={ref}
					id={selectId}
					className={cn(
						"w-full px-3 py-2 bg-dark-800 border rounded-lg text-dark-100",
						"focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						error ? "border-red-500" : "border-dark-700",
						className,
					)}
					{...props}
				>
					{placeholder && (
						<option value="" disabled>
							{placeholder}
						</option>
					)}
					{options.map(({ value, label }) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
				{error && <p className="text-sm text-red-400">{error}</p>}
			</div>
		);
	},
);

Select.displayName = "Select";
