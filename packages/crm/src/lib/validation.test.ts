/**
 * Tests for validation schemas and helper functions.
 *
 * Verifies Zod schemas for lead creation, update, and activity creation
 * per specs/02-contact-form.md and specs/07-api-endpoints.md.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	activityTypeEnum,
	createActivitySchema,
	createLeadSchema,
	emailSchema,
	formatZodErrors,
	isHoneypotFilled,
	isValidUuid,
	leadSortFields,
	leadStatusEnum,
	listLeadsQuerySchema,
	parseLeadSchema,
	parseSortParam,
	phoneSchema,
	publicLeadSchema,
	updateLeadSchema,
} from "./validation";

// ============================================================================
// createLeadSchema Tests
// ============================================================================

describe("createLeadSchema", () => {
	describe("valid data", () => {
		it("should accept valid lead data with all required fields", () => {
			const validLead = {
				name: "John Doe",
				email: "john@example.com",
				message: "I need help with my project. This is a detailed message.",
			};

			const result = createLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("John Doe");
				expect(result.data.email).toBe("john@example.com");
				expect(result.data.message).toBe(validLead.message);
				expect(result.data.status).toBe("new"); // Default value
			}
		});

		it("should accept valid lead data with all optional fields", () => {
			const validLead = {
				name: "Jane Smith",
				email: "jane@company.com",
				company: "Tech Corp",
				phone: "+1-555-123-4567",
				budget: "$50,000 - $100,000",
				projectType: "New Product / MVP",
				message: "We need a complete rebuild of our platform.",
				source: "Google Search",
				status: "contacted" as const,
				notes: "High priority lead from enterprise client.",
				tags: ["enterprise", "urgent"],
			};

			const result = createLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.company).toBe("Tech Corp");
				expect(result.data.phone).toBe("+1-555-123-4567");
				expect(result.data.budget).toBe("$50,000 - $100,000");
				expect(result.data.projectType).toBe("New Product / MVP");
				expect(result.data.source).toBe("Google Search");
				expect(result.data.status).toBe("contacted");
				expect(result.data.notes).toBe("High priority lead from enterprise client.");
				expect(result.data.tags).toEqual(["enterprise", "urgent"]);
			}
		});

		it("should accept null values for nullable fields", () => {
			const validLead = {
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message with enough characters.",
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				source: null,
				notes: null,
			};

			const result = createLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.company).toBeNull();
				expect(result.data.phone).toBeNull();
			}
		});

		it("should set default status to 'new' when not provided", () => {
			const validLead = {
				name: "Default Status Test",
				email: "default@example.com",
				message: "Testing default status value.",
			};

			const result = createLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe("new");
			}
		});
	});

	describe("required fields", () => {
		it("should reject when name is missing", () => {
			const invalidLead = {
				email: "test@example.com",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(invalidLead);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues.some((i) => i.path.includes("name"))).toBe(true);
			}
		});

		it("should reject when email is missing", () => {
			const invalidLead = {
				name: "Test Lead",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(invalidLead);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues.some((i) => i.path.includes("email"))).toBe(true);
			}
		});

		it("should reject when message is missing", () => {
			const invalidLead = {
				name: "Test Lead",
				email: "test@example.com",
			};

			const result = createLeadSchema.safeParse(invalidLead);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues.some((i) => i.path.includes("message"))).toBe(true);
			}
		});
	});

	describe("name field validation", () => {
		it("should reject name shorter than 2 characters", () => {
			const invalidLead = {
				name: "J",
				email: "test@example.com",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(invalidLead);

			expect(result.success).toBe(false);
			if (!result.success) {
				const nameError = result.error.issues.find((i) => i.path.includes("name"));
				expect(nameError?.message).toBe("Name must be at least 2 characters");
			}
		});

		it("should accept name with exactly 2 characters", () => {
			const validLead = {
				name: "Jo",
				email: "test@example.com",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
		});

		it("should reject name longer than 255 characters", () => {
			const invalidLead = {
				name: "A".repeat(256),
				email: "test@example.com",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(invalidLead);

			expect(result.success).toBe(false);
			if (!result.success) {
				const nameError = result.error.issues.find((i) => i.path.includes("name"));
				expect(nameError?.message).toBe("Name must be at most 255 characters");
			}
		});

		it("should accept name with exactly 255 characters", () => {
			const validLead = {
				name: "A".repeat(255),
				email: "test@example.com",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
		});

		it("should reject empty name", () => {
			const invalidLead = {
				name: "",
				email: "test@example.com",
				message: "This is a test message.",
			};

			const result = createLeadSchema.safeParse(invalidLead);

			expect(result.success).toBe(false);
		});
	});

	describe("email field validation", () => {
		it("should reject invalid email format", () => {
			const invalidEmails = [
				"notanemail",
				"missing@domain",
				"@nodomain.com",
				"spaces in@email.com",
				"double@@at.com",
			];

			for (const email of invalidEmails) {
				const result = createLeadSchema.safeParse({
					name: "Test",
					email,
					message: "This is a test message.",
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					expect(result.error.issues.some((i) => i.path.includes("email"))).toBe(true);
				}
			}
		});

		it("should accept valid email formats", () => {
			const validEmails = [
				"simple@example.com",
				"user.name@domain.com",
				"user+tag@example.org",
				"first.last@subdomain.domain.co.uk",
			];

			for (const email of validEmails) {
				const result = createLeadSchema.safeParse({
					name: "Test Lead",
					email,
					message: "This is a test message.",
				});

				expect(result.success).toBe(true);
			}
		});

		it("should reject email longer than 255 characters", () => {
			const longEmail = `${"a".repeat(250)}@b.com`;
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: longEmail,
				message: "This is a test message.",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const emailError = result.error.issues.find((i) => i.path.includes("email"));
				expect(emailError?.message).toBe("Email must be at most 255 characters");
			}
		});

		it("should reject empty email", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "",
				message: "This is a test message.",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const emailError = result.error.issues.find((i) => i.path.includes("email"));
				expect(emailError?.message).toBe("Email is required");
			}
		});
	});

	describe("message field validation", () => {
		it("should reject message shorter than 10 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "Short",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const messageError = result.error.issues.find((i) => i.path.includes("message"));
				expect(messageError?.message).toBe("Message must be at least 10 characters");
			}
		});

		it("should accept message with exactly 10 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "1234567890",
			});

			expect(result.success).toBe(true);
		});

		it("should reject message longer than 5000 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "A".repeat(5001),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const messageError = result.error.issues.find((i) => i.path.includes("message"));
				expect(messageError?.message).toBe("Message must be at most 5000 characters");
			}
		});

		it("should accept message with exactly 5000 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "A".repeat(5000),
			});

			expect(result.success).toBe(true);
		});
	});

	describe("status field validation", () => {
		it("should accept all valid status values", () => {
			for (const status of leadStatusEnum) {
				const result = createLeadSchema.safeParse({
					name: "Test Lead",
					email: "test@example.com",
					message: "This is a test message.",
					status,
				});

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.status).toBe(status);
				}
			}
		});

		it("should reject invalid status values", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				status: "invalid_status",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("phone field validation", () => {
		it("should accept valid phone formats", () => {
			const validPhones = [
				"+1-555-123-4567",
				"(555) 123-4567",
				"555.123.4567",
				"+44 20 7123 4567",
				"1234567890",
			];

			for (const phone of validPhones) {
				const result = createLeadSchema.safeParse({
					name: "Test Lead",
					email: "test@example.com",
					message: "This is a test message.",
					phone,
				});

				expect(result.success).toBe(true);
			}
		});

		it("should reject invalid phone formats", () => {
			const invalidPhones = ["abc-def-ghij", "phone: 123", "123-ABC-4567"];

			for (const phone of invalidPhones) {
				const result = createLeadSchema.safeParse({
					name: "Test Lead",
					email: "test@example.com",
					message: "This is a test message.",
					phone,
				});

				expect(result.success).toBe(false);
			}
		});

		it("should reject phone longer than 50 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				phone: "1".repeat(51),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const phoneError = result.error.issues.find((i) => i.path.includes("phone"));
				expect(phoneError?.message).toBe("Phone must be at most 50 characters");
			}
		});
	});

	describe("tags field validation", () => {
		it("should accept valid tags array", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				tags: ["priority", "enterprise", "urgent"],
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.tags).toEqual(["priority", "enterprise", "urgent"]);
			}
		});

		it("should reject tags array with more than 20 items", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const tagsError = result.error.issues.find((i) => i.path.includes("tags"));
				expect(tagsError?.message).toBe("Maximum 20 tags allowed");
			}
		});

		it("should reject tag longer than 50 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				tags: ["A".repeat(51)],
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const tagsError = result.error.issues.find((i) => i.path[0] === "tags");
				expect(tagsError?.message).toBe("Tag must be at most 50 characters");
			}
		});

		it("should accept exactly 20 tags", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
			});

			expect(result.success).toBe(true);
		});
	});

	describe("notes field validation", () => {
		it("should reject notes longer than 10000 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				notes: "A".repeat(10001),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const notesError = result.error.issues.find((i) => i.path.includes("notes"));
				expect(notesError?.message).toBe("Notes must be at most 10000 characters");
			}
		});

		it("should accept notes with exactly 10000 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				notes: "A".repeat(10000),
			});

			expect(result.success).toBe(true);
		});
	});

	describe("company field validation", () => {
		it("should reject company longer than 255 characters", () => {
			const result = createLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				company: "A".repeat(256),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const companyError = result.error.issues.find((i) => i.path.includes("company"));
				expect(companyError?.message).toBe("Company must be at most 255 characters");
			}
		});
	});
});

// ============================================================================
// publicLeadSchema Tests
// ============================================================================

describe("publicLeadSchema", () => {
	describe("valid data", () => {
		it("should accept valid public lead data", () => {
			const validLead = {
				name: "Public Lead",
				email: "public@example.com",
				message: "I am interested in your services.",
			};

			const result = publicLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
		});

		it("should accept all optional fields", () => {
			const validLead = {
				name: "Public Lead",
				email: "public@example.com",
				company: "Public Corp",
				phone: "+1-555-000-0000",
				budget: "Not sure yet",
				projectType: "New Product / MVP",
				message: "Full submission from contact form.",
				source: "LinkedIn",
			};

			const result = publicLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
		});
	});

	describe("honeypot field behavior", () => {
		it("should accept empty honeypot field (legitimate submission)", () => {
			const validLead = {
				name: "Legitimate User",
				email: "legitimate@example.com",
				message: "This is a real submission from a human.",
				website: "",
			};

			const result = publicLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.website).toBe("");
			}
		});

		it("should accept missing honeypot field (legitimate submission)", () => {
			const validLead = {
				name: "Legitimate User",
				email: "legitimate@example.com",
				message: "This is a real submission from a human.",
			};

			const result = publicLeadSchema.safeParse(validLead);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.website).toBeUndefined();
			}
		});

		it("should parse filled honeypot field (bot submission) - validation passes but should be checked separately", () => {
			const botSubmission = {
				name: "Bot User",
				email: "bot@spam.com",
				message: "Buy cheap products now!",
				website: "http://spam-site.com",
			};

			const result = publicLeadSchema.safeParse(botSubmission);

			// Schema parses successfully - the honeypot check is done via isHoneypotFilled
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.website).toBe("http://spam-site.com");
			}
		});
	});

	describe("field validations (same as createLeadSchema)", () => {
		it("should reject name shorter than 2 characters", () => {
			const result = publicLeadSchema.safeParse({
				name: "X",
				email: "test@example.com",
				message: "This is a test message.",
			});

			expect(result.success).toBe(false);
		});

		it("should reject invalid email format", () => {
			const result = publicLeadSchema.safeParse({
				name: "Test Lead",
				email: "invalid-email",
				message: "This is a test message.",
			});

			expect(result.success).toBe(false);
		});

		it("should reject message shorter than 10 characters", () => {
			const result = publicLeadSchema.safeParse({
				name: "Test Lead",
				email: "test@example.com",
				message: "Short",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("differences from createLeadSchema", () => {
		it("should not have status field", () => {
			const leadWithStatus = {
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				status: "contacted",
			};

			const result = publicLeadSchema.safeParse(leadWithStatus);

			// Status is not in the schema, so it will be stripped or ignored
			expect(result.success).toBe(true);
			if (result.success) {
				expect((result.data as Record<string, unknown>).status).toBeUndefined();
			}
		});

		it("should not have notes field", () => {
			const leadWithNotes = {
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				notes: "Internal notes",
			};

			const result = publicLeadSchema.safeParse(leadWithNotes);

			expect(result.success).toBe(true);
			if (result.success) {
				expect((result.data as Record<string, unknown>).notes).toBeUndefined();
			}
		});

		it("should not have tags field", () => {
			const leadWithTags = {
				name: "Test Lead",
				email: "test@example.com",
				message: "This is a test message.",
				tags: ["tag1", "tag2"],
			};

			const result = publicLeadSchema.safeParse(leadWithTags);

			expect(result.success).toBe(true);
			if (result.success) {
				expect((result.data as Record<string, unknown>).tags).toBeUndefined();
			}
		});
	});
});

// ============================================================================
// updateLeadSchema Tests
// ============================================================================

describe("updateLeadSchema", () => {
	describe("partial updates", () => {
		it("should accept empty object (no updates)", () => {
			const result = updateLeadSchema.safeParse({});

			expect(result.success).toBe(true);
		});

		it("should accept single field update", () => {
			const result = updateLeadSchema.safeParse({ name: "Updated Name" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("Updated Name");
			}
		});

		it("should accept multiple field updates", () => {
			const updates = {
				name: "Updated Name",
				email: "updated@example.com",
				status: "qualified" as const,
			};

			const result = updateLeadSchema.safeParse(updates);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("Updated Name");
				expect(result.data.email).toBe("updated@example.com");
				expect(result.data.status).toBe("qualified");
			}
		});

		it("should accept status update only", () => {
			const result = updateLeadSchema.safeParse({ status: "won" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe("won");
			}
		});

		it("should accept notes update to null", () => {
			const result = updateLeadSchema.safeParse({ notes: null });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.notes).toBeNull();
			}
		});

		it("should accept tags update", () => {
			const result = updateLeadSchema.safeParse({ tags: ["new-tag", "priority"] });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.tags).toEqual(["new-tag", "priority"]);
			}
		});
	});

	describe("optional field validations", () => {
		it("should validate name when provided", () => {
			const result = updateLeadSchema.safeParse({ name: "X" });

			expect(result.success).toBe(false);
			if (!result.success) {
				const nameError = result.error.issues.find((i) => i.path.includes("name"));
				expect(nameError?.message).toBe("Name must be at least 2 characters");
			}
		});

		it("should validate email format when provided", () => {
			const result = updateLeadSchema.safeParse({ email: "invalid" });

			expect(result.success).toBe(false);
		});

		it("should validate message length when provided", () => {
			const result = updateLeadSchema.safeParse({ message: "short" });

			expect(result.success).toBe(false);
			if (!result.success) {
				const messageError = result.error.issues.find((i) => i.path.includes("message"));
				expect(messageError?.message).toBe("Message must be at least 10 characters");
			}
		});

		it("should validate status enum when provided", () => {
			const result = updateLeadSchema.safeParse({ status: "invalid" });

			expect(result.success).toBe(false);
		});

		it("should validate phone format when provided", () => {
			const result = updateLeadSchema.safeParse({ phone: "abc-not-valid" });

			expect(result.success).toBe(false);
		});

		it("should validate tags array size when provided", () => {
			const result = updateLeadSchema.safeParse({
				tags: Array.from({ length: 25 }, (_, i) => `tag${i}`),
			});

			expect(result.success).toBe(false);
		});
	});

	describe("all status transitions", () => {
		it("should accept all valid status values for updates", () => {
			for (const status of leadStatusEnum) {
				const result = updateLeadSchema.safeParse({ status });

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.status).toBe(status);
				}
			}
		});
	});
});

// ============================================================================
// createActivitySchema Tests
// ============================================================================

describe("createActivitySchema", () => {
	describe("type validation", () => {
		it("should accept all valid activity types", () => {
			for (const type of activityTypeEnum) {
				const result = createActivitySchema.safeParse({
					type,
					description: "Activity description",
				});

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.type).toBe(type);
				}
			}
		});

		it("should reject invalid activity type", () => {
			const result = createActivitySchema.safeParse({
				type: "invalid_type",
				description: "Activity description",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const typeError = result.error.issues.find((i) => i.path.includes("type"));
				expect(typeError?.message).toBe(`Type must be one of: ${activityTypeEnum.join(", ")}`);
			}
		});

		it("should reject missing type", () => {
			const result = createActivitySchema.safeParse({
				description: "Activity description",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("description validation", () => {
		it("should accept valid description", () => {
			const result = createActivitySchema.safeParse({
				type: "note",
				description: "This is a valid activity note.",
			});

			expect(result.success).toBe(true);
		});

		it("should reject empty description", () => {
			const result = createActivitySchema.safeParse({
				type: "note",
				description: "",
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const descError = result.error.issues.find((i) => i.path.includes("description"));
				expect(descError?.message).toBe("Description is required");
			}
		});

		it("should reject description longer than 5000 characters", () => {
			const result = createActivitySchema.safeParse({
				type: "note",
				description: "A".repeat(5001),
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				const descError = result.error.issues.find((i) => i.path.includes("description"));
				expect(descError?.message).toBe("Description must be at most 5000 characters");
			}
		});

		it("should accept description with exactly 5000 characters", () => {
			const result = createActivitySchema.safeParse({
				type: "note",
				description: "A".repeat(5000),
			});

			expect(result.success).toBe(true);
		});

		it("should reject missing description", () => {
			const result = createActivitySchema.safeParse({
				type: "note",
			});

			expect(result.success).toBe(false);
		});
	});

	describe("activity type use cases", () => {
		it("should accept note activity", () => {
			const result = createActivitySchema.safeParse({
				type: "note",
				description: "Client mentioned budget constraints.",
			});

			expect(result.success).toBe(true);
		});

		it("should accept email activity", () => {
			const result = createActivitySchema.safeParse({
				type: "email",
				description: "Sent follow-up email with proposal.",
			});

			expect(result.success).toBe(true);
		});

		it("should accept call activity", () => {
			const result = createActivitySchema.safeParse({
				type: "call",
				description: "30-minute discovery call completed.",
			});

			expect(result.success).toBe(true);
		});

		it("should accept meeting activity", () => {
			const result = createActivitySchema.safeParse({
				type: "meeting",
				description: "In-person meeting at client office.",
			});

			expect(result.success).toBe(true);
		});

		it("should accept status_change activity", () => {
			const result = createActivitySchema.safeParse({
				type: "status_change",
				description: "Status changed from new to contacted.",
			});

			expect(result.success).toBe(true);
		});
	});
});

// ============================================================================
// listLeadsQuerySchema Tests
// ============================================================================

describe("listLeadsQuerySchema", () => {
	describe("pagination defaults", () => {
		it("should set default page to 1", () => {
			const result = listLeadsQuerySchema.safeParse({});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.page).toBe(1);
			}
		});

		it("should set default limit to 20", () => {
			const result = listLeadsQuerySchema.safeParse({});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.limit).toBe(20);
			}
		});

		it("should set default sort to -createdAt", () => {
			const result = listLeadsQuerySchema.safeParse({});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sort).toBe("-createdAt");
			}
		});
	});

	describe("pagination validation", () => {
		it("should accept valid page number", () => {
			const result = listLeadsQuerySchema.safeParse({ page: 5 });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.page).toBe(5);
			}
		});

		it("should coerce string page to number", () => {
			const result = listLeadsQuerySchema.safeParse({ page: "3" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.page).toBe(3);
			}
		});

		it("should reject non-positive page number", () => {
			const result = listLeadsQuerySchema.safeParse({ page: 0 });

			expect(result.success).toBe(false);
			if (!result.success) {
				const pageError = result.error.issues.find((i) => i.path.includes("page"));
				expect(pageError?.message).toBe("Page must be positive");
			}
		});

		it("should reject negative page number", () => {
			const result = listLeadsQuerySchema.safeParse({ page: -1 });

			expect(result.success).toBe(false);
		});

		it("should reject non-integer page number", () => {
			const result = listLeadsQuerySchema.safeParse({ page: 1.5 });

			expect(result.success).toBe(false);
			if (!result.success) {
				const pageError = result.error.issues.find((i) => i.path.includes("page"));
				expect(pageError?.message).toBe("Page must be an integer");
			}
		});
	});

	describe("limit validation", () => {
		it("should accept valid limit", () => {
			const result = listLeadsQuerySchema.safeParse({ limit: 50 });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.limit).toBe(50);
			}
		});

		it("should coerce string limit to number", () => {
			const result = listLeadsQuerySchema.safeParse({ limit: "25" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.limit).toBe(25);
			}
		});

		it("should reject limit greater than 100", () => {
			const result = listLeadsQuerySchema.safeParse({ limit: 101 });

			expect(result.success).toBe(false);
			if (!result.success) {
				const limitError = result.error.issues.find((i) => i.path.includes("limit"));
				expect(limitError?.message).toBe("Maximum 100 items per page");
			}
		});

		it("should accept limit of exactly 100", () => {
			const result = listLeadsQuerySchema.safeParse({ limit: 100 });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.limit).toBe(100);
			}
		});

		it("should reject non-positive limit", () => {
			const result = listLeadsQuerySchema.safeParse({ limit: 0 });

			expect(result.success).toBe(false);
		});

		it("should reject non-integer limit", () => {
			const result = listLeadsQuerySchema.safeParse({ limit: 10.5 });

			expect(result.success).toBe(false);
		});
	});

	describe("status filter", () => {
		it("should accept valid status filter", () => {
			for (const status of leadStatusEnum) {
				const result = listLeadsQuerySchema.safeParse({ status });

				expect(result.success).toBe(true);
				if (result.success) {
					expect(result.data.status).toBe(status);
				}
			}
		});

		it("should reject invalid status filter", () => {
			const result = listLeadsQuerySchema.safeParse({ status: "invalid" });

			expect(result.success).toBe(false);
		});

		it("should allow missing status filter (optional)", () => {
			const result = listLeadsQuerySchema.safeParse({});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBeUndefined();
			}
		});
	});

	describe("search filter", () => {
		it("should accept valid search string", () => {
			const result = listLeadsQuerySchema.safeParse({ search: "john" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.search).toBe("john");
			}
		});

		it("should reject search longer than 100 characters", () => {
			const result = listLeadsQuerySchema.safeParse({ search: "A".repeat(101) });

			expect(result.success).toBe(false);
			if (!result.success) {
				const searchError = result.error.issues.find((i) => i.path.includes("search"));
				expect(searchError?.message).toBe("Search query must be at most 100 characters");
			}
		});

		it("should accept search with exactly 100 characters", () => {
			const result = listLeadsQuerySchema.safeParse({ search: "A".repeat(100) });

			expect(result.success).toBe(true);
		});
	});

	describe("sort parameter", () => {
		it("should accept custom sort parameter", () => {
			const result = listLeadsQuerySchema.safeParse({ sort: "name" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sort).toBe("name");
			}
		});

		it("should accept descending sort parameter", () => {
			const result = listLeadsQuerySchema.safeParse({ sort: "-updatedAt" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.sort).toBe("-updatedAt");
			}
		});
	});

	describe("combined query parameters", () => {
		it("should accept all parameters together", () => {
			const result = listLeadsQuerySchema.safeParse({
				page: 2,
				limit: 50,
				status: "qualified",
				search: "enterprise",
				sort: "-name",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.page).toBe(2);
				expect(result.data.limit).toBe(50);
				expect(result.data.status).toBe("qualified");
				expect(result.data.search).toBe("enterprise");
				expect(result.data.sort).toBe("-name");
			}
		});
	});
});

// ============================================================================
// parseLeadSchema Tests
// ============================================================================

describe("parseLeadSchema", () => {
	describe("text validation", () => {
		it("should accept valid text", () => {
			const result = parseLeadSchema.safeParse({
				text: "John Doe from Acme Corp at john@acme.com wants to build an MVP.",
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.autoSave).toBe(false); // Default value
			}
		});

		it("should reject empty text", () => {
			const result = parseLeadSchema.safeParse({ text: "" });

			expect(result.success).toBe(false);
			if (!result.success) {
				const textError = result.error.issues.find((i) => i.path.includes("text"));
				expect(textError?.message).toBe("Text is required");
			}
		});

		it("should reject text longer than 5000 characters", () => {
			const result = parseLeadSchema.safeParse({ text: "A".repeat(5001) });

			expect(result.success).toBe(false);
			if (!result.success) {
				const textError = result.error.issues.find((i) => i.path.includes("text"));
				expect(textError?.message).toBe("Text must be at most 5000 characters");
			}
		});

		it("should accept text with exactly 5000 characters", () => {
			const result = parseLeadSchema.safeParse({ text: "A".repeat(5000) });

			expect(result.success).toBe(true);
		});

		it("should accept single character text", () => {
			const result = parseLeadSchema.safeParse({ text: "A" });

			expect(result.success).toBe(true);
		});
	});

	describe("autoSave parameter", () => {
		it("should default autoSave to false", () => {
			const result = parseLeadSchema.safeParse({ text: "Some lead text" });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.autoSave).toBe(false);
			}
		});

		it("should accept autoSave as true", () => {
			const result = parseLeadSchema.safeParse({
				text: "Some lead text",
				autoSave: true,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.autoSave).toBe(true);
			}
		});

		it("should accept autoSave as false", () => {
			const result = parseLeadSchema.safeParse({
				text: "Some lead text",
				autoSave: false,
			});

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.autoSave).toBe(false);
			}
		});
	});
});

// ============================================================================
// emailSchema Tests
// ============================================================================

describe("emailSchema", () => {
	it("should accept valid emails", () => {
		const validEmails = [
			"test@example.com",
			"user.name@domain.org",
			"user+tag@subdomain.domain.co.uk",
			"first-last@example.io",
		];

		for (const email of validEmails) {
			const result = emailSchema.safeParse(email);
			expect(result.success).toBe(true);
		}
	});

	it("should reject invalid emails", () => {
		const invalidEmails = ["", "notanemail", "@nodomain.com", "no@tld"];

		for (const email of invalidEmails) {
			const result = emailSchema.safeParse(email);
			expect(result.success).toBe(false);
		}
	});

	it("should reject email longer than 255 characters", () => {
		const longEmail = `${"a".repeat(250)}@b.com`;
		const result = emailSchema.safeParse(longEmail);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe("Email must be at most 255 characters");
		}
	});

	it("should provide specific error for empty email", () => {
		const result = emailSchema.safeParse("");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe("Email is required");
		}
	});
});

// ============================================================================
// phoneSchema Tests
// ============================================================================

describe("phoneSchema", () => {
	it("should accept valid phone formats", () => {
		const validPhones = [
			"+1-555-123-4567",
			"(555) 123-4567",
			"555.123.4567",
			"+44 20 7123 4567",
			"1234567890",
			"+1 (555) 123-4567",
		];

		for (const phone of validPhones) {
			const result = phoneSchema.safeParse(phone);
			expect(result.success).toBe(true);
		}
	});

	it("should accept null", () => {
		const result = phoneSchema.safeParse(null);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBeNull();
		}
	});

	it("should accept undefined", () => {
		const result = phoneSchema.safeParse(undefined);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBeUndefined();
		}
	});

	it("should reject invalid phone formats", () => {
		const invalidPhones = ["abc-def-ghij", "phone: 123", "call me at 555", "123-ABC-4567"];

		for (const phone of invalidPhones) {
			const result = phoneSchema.safeParse(phone);
			expect(result.success).toBe(false);
		}
	});

	it("should reject phone longer than 50 characters", () => {
		const result = phoneSchema.safeParse("1".repeat(51));

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe("Phone must be at most 50 characters");
		}
	});
});

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe("parseSortParam", () => {
	describe("ascending sort", () => {
		it("should parse ascending sort by valid field", () => {
			for (const field of leadSortFields) {
				const result = parseSortParam(field);

				expect(result.field).toBe(field);
				expect(result.direction).toBe("asc");
			}
		});

		it("should parse name ascending", () => {
			const result = parseSortParam("name");

			expect(result.field).toBe("name");
			expect(result.direction).toBe("asc");
		});
	});

	describe("descending sort", () => {
		it("should parse descending sort by valid field", () => {
			for (const field of leadSortFields) {
				const result = parseSortParam(`-${field}`);

				expect(result.field).toBe(field);
				expect(result.direction).toBe("desc");
			}
		});

		it("should parse -createdAt descending", () => {
			const result = parseSortParam("-createdAt");

			expect(result.field).toBe("createdAt");
			expect(result.direction).toBe("desc");
		});
	});

	describe("invalid field handling", () => {
		it("should default to createdAt for invalid ascending field", () => {
			const result = parseSortParam("invalidField");

			expect(result.field).toBe("createdAt");
			expect(result.direction).toBe("asc");
		});

		it("should default to createdAt for invalid descending field", () => {
			const result = parseSortParam("-invalidField");

			expect(result.field).toBe("createdAt");
			expect(result.direction).toBe("desc");
		});

		it("should default to createdAt for empty string", () => {
			const result = parseSortParam("");

			expect(result.field).toBe("createdAt");
			expect(result.direction).toBe("asc");
		});

		it("should default to createdAt for just a hyphen", () => {
			const result = parseSortParam("-");

			expect(result.field).toBe("createdAt");
			expect(result.direction).toBe("desc");
		});
	});

	describe("all valid sort fields", () => {
		it("should recognize all valid sort fields", () => {
			const expectedFields = ["createdAt", "updatedAt", "name", "email", "company", "status"];

			expect([...leadSortFields]).toEqual(expectedFields);
		});
	});
});

describe("formatZodErrors", () => {
	it("should format single field error", () => {
		const result = createLeadSchema.safeParse({
			name: "X",
			email: "test@example.com",
			message: "This is a test message.",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = formatZodErrors(result.error);

			expect(errors.name).toBe("Name must be at least 2 characters");
		}
	});

	it("should format multiple field errors", () => {
		const result = createLeadSchema.safeParse({
			name: "X",
			email: "invalid",
			message: "short",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = formatZodErrors(result.error);

			expect(errors.name).toBeDefined();
			expect(errors.email).toBeDefined();
			expect(errors.message).toBeDefined();
		}
	});

	it("should only keep first error for each field", () => {
		// Create a schema that can produce multiple errors for the same field
		const testSchema = z.object({
			value: z.string().min(5, "Too short").regex(/^\d+$/, "Must be digits"),
		});

		const result = testSchema.safeParse({ value: "ab" });

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = formatZodErrors(result.error);

			// Should only have one error for 'value'
			expect(errors.value).toBe("Too short");
		}
	});

	it("should handle nested path errors", () => {
		const result = createLeadSchema.safeParse({
			name: "Test",
			email: "test@example.com",
			message: "This is a test message.",
			tags: ["A".repeat(51)],
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			const errors = formatZodErrors(result.error);

			// Path would be "tags.0"
			expect(Object.keys(errors).some((key) => key.startsWith("tags"))).toBe(true);
		}
	});

	it("should handle empty error list", () => {
		const emptyError = new z.ZodError([]);
		const errors = formatZodErrors(emptyError);

		expect(errors).toEqual({});
	});

	it("should handle error with empty path", () => {
		const errorWithEmptyPath = new z.ZodError([
			{
				code: "custom",
				path: [],
				message: "General error",
			},
		]);

		const errors = formatZodErrors(errorWithEmptyPath);

		expect(errors.unknown).toBe("General error");
	});
});

describe("isHoneypotFilled", () => {
	describe("spam detection (returns true)", () => {
		it("should return true for filled honeypot field", () => {
			expect(isHoneypotFilled("http://spam.com")).toBe(true);
		});

		it("should return true for any non-empty string", () => {
			expect(isHoneypotFilled("anything")).toBe(true);
		});

		it("should return true for single character", () => {
			expect(isHoneypotFilled("x")).toBe(true);
		});

		it("should return true for string with only spaces after trim check fails", () => {
			// "   " after trim becomes "", so this should actually return false
			expect(isHoneypotFilled("   ")).toBe(false);
		});
	});

	describe("legitimate submission (returns false)", () => {
		it("should return false for undefined", () => {
			expect(isHoneypotFilled(undefined)).toBe(false);
		});

		it("should return false for null", () => {
			expect(isHoneypotFilled(null)).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isHoneypotFilled("")).toBe(false);
		});

		it("should return false for whitespace-only string", () => {
			expect(isHoneypotFilled("   ")).toBe(false);
			expect(isHoneypotFilled("\t")).toBe(false);
			expect(isHoneypotFilled("\n")).toBe(false);
			expect(isHoneypotFilled("  \t\n  ")).toBe(false);
		});
	});
});

describe("isValidUuid", () => {
	describe("valid UUIDs", () => {
		it("should return true for valid UUID v4", () => {
			expect(isValidUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
		});

		it("should return true for valid UUID v1", () => {
			expect(isValidUuid("550e8400-e29b-11d4-a716-446655440000")).toBe(true);
		});

		it("should return true for lowercase UUID", () => {
			expect(isValidUuid("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
		});

		it("should return true for uppercase UUID", () => {
			expect(isValidUuid("A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D")).toBe(true);
		});

		it("should return true for mixed case UUID", () => {
			expect(isValidUuid("a1B2c3D4-E5f6-4A7b-8C9d-0E1f2A3b4C5d")).toBe(true);
		});

		it("should return true for UUID with all zeros", () => {
			expect(isValidUuid("00000000-0000-1000-8000-000000000000")).toBe(true);
		});

		it("should return true for UUID with all f's", () => {
			expect(isValidUuid("ffffffff-ffff-4fff-bfff-ffffffffffff")).toBe(true);
		});
	});

	describe("invalid UUIDs", () => {
		it("should return false for empty string", () => {
			expect(isValidUuid("")).toBe(false);
		});

		it("should return false for random string", () => {
			expect(isValidUuid("not-a-uuid")).toBe(false);
		});

		it("should return false for UUID without hyphens", () => {
			expect(isValidUuid("123e4567e89b42d3a456426614174000")).toBe(false);
		});

		it("should return false for UUID with wrong number of characters", () => {
			expect(isValidUuid("123e4567-e89b-42d3-a456-42661417400")).toBe(false);
			expect(isValidUuid("123e4567-e89b-42d3-a456-4266141740000")).toBe(false);
		});

		it("should return false for UUID with invalid characters", () => {
			expect(isValidUuid("123e4567-e89b-42d3-a456-42661417400g")).toBe(false);
			expect(isValidUuid("123e4567-e89b-42d3-a456-42661417400z")).toBe(false);
		});

		it("should return false for UUID with wrong version position", () => {
			// Version digit should be 1-5 in position 15 (after third hyphen)
			expect(isValidUuid("123e4567-e89b-02d3-a456-426614174000")).toBe(false);
			expect(isValidUuid("123e4567-e89b-62d3-a456-426614174000")).toBe(false);
		});

		it("should return false for UUID with wrong variant position", () => {
			// Variant digit should be 8, 9, a, or b in position 20 (after fourth hyphen)
			expect(isValidUuid("123e4567-e89b-42d3-0456-426614174000")).toBe(false);
			expect(isValidUuid("123e4567-e89b-42d3-c456-426614174000")).toBe(false);
			expect(isValidUuid("123e4567-e89b-42d3-f456-426614174000")).toBe(false);
		});

		it("should return false for UUID with extra hyphens", () => {
			expect(isValidUuid("123e4567-e89b-42d3-a456-4266-14174000")).toBe(false);
		});

		it("should return false for UUID with missing hyphens", () => {
			expect(isValidUuid("123e4567e89b-42d3-a456-426614174000")).toBe(false);
		});

		it("should return false for number", () => {
			// TypeScript would catch this, but runtime check
			expect(isValidUuid(12345 as unknown as string)).toBe(false);
		});

		it("should return false for null-like values", () => {
			expect(isValidUuid(null as unknown as string)).toBe(false);
			expect(isValidUuid(undefined as unknown as string)).toBe(false);
		});
	});
});
