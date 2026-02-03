/**
 * Tests for the OpenAI lead parsing integration.
 *
 * Tests cover:
 * - Budget mapping to predefined options
 * - Project type mapping to predefined options
 * - Lead text parsing with mocked OpenAI
 * - Error handling for various failure scenarios
 * - Edge cases and boundary conditions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mapBudgetToOption,
  mapProjectTypeToOption,
  parseLeadText,
  createOpenAIClient,
  isOpenAIConfigured,
  AIServiceError,
  ParseFailedError,
  type ParsedLeadData,
} from "./openai";

// ============================================================================
// BUDGET MAPPING TESTS
// ============================================================================

describe("mapBudgetToOption", () => {
  describe("direct matches", () => {
    it("should return exact match for 'Not sure yet'", () => {
      expect(mapBudgetToOption("Not sure yet")).toBe("Not sure yet");
    });

    it("should return exact match for '$5,000 - $15,000'", () => {
      expect(mapBudgetToOption("$5,000 - $15,000")).toBe("$5,000 - $15,000");
    });

    it("should return exact match for '$15,000 - $50,000'", () => {
      expect(mapBudgetToOption("$15,000 - $50,000")).toBe("$15,000 - $50,000");
    });

    it("should return exact match for '$50,000 - $100,000'", () => {
      expect(mapBudgetToOption("$50,000 - $100,000")).toBe("$50,000 - $100,000");
    });

    it("should return exact match for '$100,000+'", () => {
      expect(mapBudgetToOption("$100,000+")).toBe("$100,000+");
    });

    it("should handle case-insensitive matching", () => {
      expect(mapBudgetToOption("NOT SURE YET")).toBe("Not sure yet");
      expect(mapBudgetToOption("not sure yet")).toBe("Not sure yet");
    });
  });

  describe("'not sure' variants", () => {
    it("should map 'unsure' to 'Not sure yet'", () => {
      expect(mapBudgetToOption("unsure")).toBe("Not sure yet");
    });

    it("should map 'unknown' to 'Not sure yet'", () => {
      expect(mapBudgetToOption("unknown budget")).toBe("Not sure yet");
    });

    it("should map 'tbd' to 'Not sure yet'", () => {
      expect(mapBudgetToOption("TBD")).toBe("Not sure yet");
    });

    it("should map 'don't know' to 'Not sure yet'", () => {
      expect(mapBudgetToOption("don't know yet")).toBe("Not sure yet");
    });
  });

  describe("numeric value extraction", () => {
    it("should map '$5k' to '$5,000 - $15,000'", () => {
      expect(mapBudgetToOption("$5k")).toBe("$5,000 - $15,000");
    });

    it("should map '$10k' to '$5,000 - $15,000'", () => {
      expect(mapBudgetToOption("10k")).toBe("$5,000 - $15,000");
    });

    it("should map '$25k' to '$15,000 - $50,000'", () => {
      expect(mapBudgetToOption("$25k")).toBe("$15,000 - $50,000");
    });

    it("should map '$50k' to '$50,000 - $100,000'", () => {
      expect(mapBudgetToOption("50k")).toBe("$50,000 - $100,000");
    });

    it("should map '$75k' to '$50,000 - $100,000'", () => {
      expect(mapBudgetToOption("$75,000")).toBe("$50,000 - $100,000");
    });

    it("should map '$100k' to '$100,000+'", () => {
      expect(mapBudgetToOption("$100k")).toBe("$100,000+");
    });

    it("should map '$150,000' to '$100,000+'", () => {
      expect(mapBudgetToOption("$150,000")).toBe("$100,000+");
    });

    it("should map very low budgets to 'Not sure yet'", () => {
      expect(mapBudgetToOption("$2000")).toBe("Not sure yet");
    });
  });

  describe("range mentions", () => {
    it("should map '5k-15k' range to '$5,000 - $15,000'", () => {
      // The function extracts the first numeric value with 'k', so "5k" is parsed as 5000
      expect(mapBudgetToOption("5k to 15k")).toBe("$5,000 - $15,000");
    });

    it("should map '15k-50k' range to '$15,000 - $50,000'", () => {
      expect(mapBudgetToOption("15k to 50k range")).toBe("$15,000 - $50,000");
    });

    it("should map '50k-100k' range to '$50,000 - $100,000'", () => {
      expect(mapBudgetToOption("50k to 100k")).toBe("$50,000 - $100,000");
    });

    it("should map 'enterprise' to '$100,000+'", () => {
      expect(mapBudgetToOption("enterprise budget")).toBe("$100,000+");
    });

    it("should map 'large' to '$100,000+'", () => {
      expect(mapBudgetToOption("large budget")).toBe("$100,000+");
    });
  });

  describe("null handling", () => {
    it("should return null for null input", () => {
      expect(mapBudgetToOption(null)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(mapBudgetToOption("")).toBeNull();
    });

    it("should return null for unrecognized input", () => {
      expect(mapBudgetToOption("some random text")).toBeNull();
    });
  });
});

// ============================================================================
// PROJECT TYPE MAPPING TESTS
// ============================================================================

describe("mapProjectTypeToOption", () => {
  describe("direct matches", () => {
    it("should return exact match for 'New Product / MVP'", () => {
      expect(mapProjectTypeToOption("New Product / MVP")).toBe("New Product / MVP");
    });

    it("should return exact match for 'Staff Augmentation'", () => {
      expect(mapProjectTypeToOption("Staff Augmentation")).toBe("Staff Augmentation");
    });

    it("should return exact match for 'Legacy Modernization'", () => {
      expect(mapProjectTypeToOption("Legacy Modernization")).toBe("Legacy Modernization");
    });

    it("should return exact match for 'Cloud Migration'", () => {
      expect(mapProjectTypeToOption("Cloud Migration")).toBe("Cloud Migration");
    });

    it("should return exact match for 'Performance Optimization'", () => {
      expect(mapProjectTypeToOption("Performance Optimization")).toBe("Performance Optimization");
    });

    it("should return exact match for 'Security Audit'", () => {
      expect(mapProjectTypeToOption("Security Audit")).toBe("Security Audit");
    });

    it("should return exact match for 'Other'", () => {
      expect(mapProjectTypeToOption("Other")).toBe("Other");
    });

    it("should handle case-insensitive matching", () => {
      expect(mapProjectTypeToOption("cloud migration")).toBe("Cloud Migration");
      expect(mapProjectTypeToOption("SECURITY AUDIT")).toBe("Security Audit");
    });
  });

  describe("MVP/New Product keywords", () => {
    it("should map 'mvp' to 'New Product / MVP'", () => {
      expect(mapProjectTypeToOption("building an mvp")).toBe("New Product / MVP");
    });

    it("should map 'new product' to 'New Product / MVP'", () => {
      expect(mapProjectTypeToOption("new product development")).toBe("New Product / MVP");
    });

    it("should map 'startup' to 'New Product / MVP'", () => {
      expect(mapProjectTypeToOption("startup project")).toBe("New Product / MVP");
    });

    it("should map 'greenfield' to 'New Product / MVP'", () => {
      expect(mapProjectTypeToOption("greenfield project")).toBe("New Product / MVP");
    });

    it("should map 'build from scratch' to 'New Product / MVP'", () => {
      expect(mapProjectTypeToOption("build from scratch")).toBe("New Product / MVP");
    });
  });

  describe("Staff Augmentation keywords", () => {
    it("should map 'staff augmentation' to 'Staff Augmentation'", () => {
      expect(mapProjectTypeToOption("need staff augmentation")).toBe("Staff Augmentation");
    });

    it("should map 'contractor' to 'Staff Augmentation'", () => {
      expect(mapProjectTypeToOption("looking for contractors")).toBe("Staff Augmentation");
    });

    it("should map 'developer' to 'Staff Augmentation'", () => {
      expect(mapProjectTypeToOption("need more developers")).toBe("Staff Augmentation");
    });

    it("should map 'engineer' to 'Staff Augmentation'", () => {
      expect(mapProjectTypeToOption("hiring engineers")).toBe("Staff Augmentation");
    });

    it("should map 'team extension' to 'Staff Augmentation'", () => {
      expect(mapProjectTypeToOption("team extension")).toBe("Staff Augmentation");
    });
  });

  describe("Legacy Modernization keywords", () => {
    it("should map 'legacy' to 'Legacy Modernization'", () => {
      expect(mapProjectTypeToOption("legacy system")).toBe("Legacy Modernization");
    });

    it("should map 'modernization' to 'Legacy Modernization'", () => {
      expect(mapProjectTypeToOption("system modernization")).toBe("Legacy Modernization");
    });

    it("should map 'refactor' to 'Legacy Modernization'", () => {
      expect(mapProjectTypeToOption("code refactoring")).toBe("Legacy Modernization");
    });

    it("should map 'rewrite' to 'Legacy Modernization'", () => {
      expect(mapProjectTypeToOption("app rewrite")).toBe("Legacy Modernization");
    });

    it("should map 'upgrade' to 'Legacy Modernization'", () => {
      expect(mapProjectTypeToOption("system upgrade")).toBe("Legacy Modernization");
    });
  });

  describe("Cloud Migration keywords", () => {
    it("should map 'cloud' to 'Cloud Migration'", () => {
      expect(mapProjectTypeToOption("cloud project")).toBe("Cloud Migration");
    });

    it("should map 'migration' to 'Cloud Migration'", () => {
      expect(mapProjectTypeToOption("data migration")).toBe("Cloud Migration");
    });

    it("should map 'aws' to 'Cloud Migration'", () => {
      expect(mapProjectTypeToOption("moving to AWS")).toBe("Cloud Migration");
    });

    it("should map 'azure' to 'Cloud Migration'", () => {
      expect(mapProjectTypeToOption("Azure migration")).toBe("Cloud Migration");
    });

    it("should map 'gcp' to 'Cloud Migration'", () => {
      expect(mapProjectTypeToOption("GCP deployment")).toBe("Cloud Migration");
    });
  });

  describe("Performance Optimization keywords", () => {
    it("should map 'performance' to 'Performance Optimization'", () => {
      expect(mapProjectTypeToOption("performance issues")).toBe("Performance Optimization");
    });

    it("should map 'optimization' to 'Performance Optimization'", () => {
      expect(mapProjectTypeToOption("code optimization")).toBe("Performance Optimization");
    });

    it("should map 'slow' to 'Performance Optimization'", () => {
      expect(mapProjectTypeToOption("app is slow")).toBe("Performance Optimization");
    });

    it("should map 'scale' to 'Performance Optimization'", () => {
      expect(mapProjectTypeToOption("need to scale")).toBe("Performance Optimization");
    });

    it("should map 'scaling' to 'Performance Optimization'", () => {
      expect(mapProjectTypeToOption("scaling issues")).toBe("Performance Optimization");
    });
  });

  describe("Security Audit keywords", () => {
    it("should map 'security' to 'Security Audit'", () => {
      expect(mapProjectTypeToOption("security review")).toBe("Security Audit");
    });

    it("should map 'audit' to 'Security Audit'", () => {
      expect(mapProjectTypeToOption("code audit")).toBe("Security Audit");
    });

    it("should map 'penetration' to 'Security Audit'", () => {
      expect(mapProjectTypeToOption("penetration testing")).toBe("Security Audit");
    });

    it("should map 'vulnerability' to 'Security Audit'", () => {
      expect(mapProjectTypeToOption("vulnerability assessment")).toBe("Security Audit");
    });

    it("should map 'compliance' to 'Security Audit'", () => {
      expect(mapProjectTypeToOption("compliance check")).toBe("Security Audit");
    });
  });

  describe("null handling and fallback", () => {
    it("should return null for null input", () => {
      expect(mapProjectTypeToOption(null)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(mapProjectTypeToOption("")).toBeNull();
    });

    it("should return 'Other' for unrecognized input", () => {
      expect(mapProjectTypeToOption("some random project")).toBe("Other");
    });
  });
});

// ============================================================================
// OPENAI CLIENT TESTS
// ============================================================================

describe("createOpenAIClient", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalEnv) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("should throw AIServiceError when API key is not set", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createOpenAIClient()).toThrow(AIServiceError);
    expect(() => createOpenAIClient()).toThrow("OpenAI API key not configured");
  });

  it("should create client when API key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    const client = createOpenAIClient();
    expect(client).toBeDefined();
  });
});

describe("isOpenAIConfigured", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalEnv) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it("should return false when API key is not set", () => {
    delete process.env.OPENAI_API_KEY;
    expect(isOpenAIConfigured()).toBe(false);
  });

  it("should return true when API key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(isOpenAIConfigured()).toBe(true);
  });
});

// ============================================================================
// PARSE LEAD TEXT TESTS
// ============================================================================

describe("parseLeadText", () => {
  // Mock OpenAI client
  const mockCreate = vi.fn();
  const mockClient = {
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  } as unknown as import("openai").default;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful parsing", () => {
    it("should parse well-formed lead text", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Sarah Chen",
                email: "sarah@techstartup.io",
                company: "TechStartup Inc",
                phone: "415-555-9876",
                budget: "$75k",
                projectType: "Cloud Migration",
                source: "LinkedIn",
                message: "Looking for help with cloud migration",
                confidence: 0.92,
              }),
            },
          },
        ],
      });

      const result = await parseLeadText(
        "Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc.",
        mockClient
      );

      expect(result.parsed.name).toBe("Sarah Chen");
      expect(result.parsed.email).toBe("sarah@techstartup.io");
      expect(result.parsed.company).toBe("TechStartup Inc");
      expect(result.parsed.phone).toBe("415-555-9876");
      expect(result.parsed.budget).toBe("$50,000 - $100,000");
      expect(result.parsed.projectType).toBe("Cloud Migration");
      expect(result.parsed.source).toBe("LinkedIn");
      expect(result.confidence).toBe(0.92);
      expect(result.extractedFields).toContain("name");
      expect(result.extractedFields).toContain("email");
    });

    it("should handle partial data extraction", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "John Doe",
                email: "john@example.com",
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: "Interested in services",
                confidence: 0.65,
              }),
            },
          },
        ],
      });

      const result = await parseLeadText("John Doe john@example.com", mockClient);

      expect(result.parsed.name).toBe("John Doe");
      expect(result.parsed.email).toBe("john@example.com");
      expect(result.parsed.company).toBeNull();
      expect(result.confidence).toBe(0.65);
      expect(result.extractedFields).toEqual(["name", "email", "message"]);
    });

    it("should normalize email to lowercase", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Test User",
                email: "TEST@EXAMPLE.COM",
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: "Test",
                confidence: 0.8,
              }),
            },
          },
        ],
      });

      const result = await parseLeadText("Test User TEST@EXAMPLE.COM", mockClient);

      expect(result.parsed.email).toBe("test@example.com");
    });

    it("should reject invalid emails", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Test User",
                email: "invalid-email",
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: "Test",
                confidence: 0.5,
              }),
            },
          },
        ],
      });

      const result = await parseLeadText("Test User", mockClient);

      expect(result.parsed.email).toBeNull();
    });

    it("should trim whitespace from all string fields", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "  John Doe  ",
                email: " john@example.com ",
                company: "  ACME Corp  ",
                phone: "  555-1234  ",
                budget: null,
                projectType: null,
                source: "  LinkedIn  ",
                message: "  Hello  ",
                confidence: 0.8,
              }),
            },
          },
        ],
      });

      const result = await parseLeadText("John Doe", mockClient);

      expect(result.parsed.name).toBe("John Doe");
      expect(result.parsed.email).toBe("john@example.com");
      expect(result.parsed.company).toBe("ACME Corp");
      expect(result.parsed.phone).toBe("555-1234");
      expect(result.parsed.source).toBe("LinkedIn");
      expect(result.parsed.message).toBe("Hello");
    });
  });

  describe("error handling", () => {
    it("should throw AIServiceError on empty response", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      await expect(parseLeadText("test", mockClient)).rejects.toThrow(AIServiceError);
    });

    it("should throw AIServiceError with correct message on empty response", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      await expect(parseLeadText("test", mockClient)).rejects.toThrow("Empty response from OpenAI");
    });

    it("should throw AIServiceError on invalid JSON", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "not valid json",
            },
          },
        ],
      });

      await expect(parseLeadText("test", mockClient)).rejects.toThrow(AIServiceError);
    });

    it("should throw AIServiceError with correct message on invalid JSON", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "not valid json",
            },
          },
        ],
      });

      await expect(parseLeadText("test", mockClient)).rejects.toThrow("Invalid JSON response");
    });

    it("should throw ParseFailedError on low confidence", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: null,
                email: null,
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: null,
                confidence: 0.1,
              }),
            },
          },
        ],
      });

      await expect(parseLeadText("random gibberish", mockClient)).rejects.toThrow(ParseFailedError);
    });

    it("should throw ParseFailedError when no fields extracted", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: null,
                email: null,
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: null,
                confidence: 0.5,
              }),
            },
          },
        ],
      });

      await expect(parseLeadText("test", mockClient)).rejects.toThrow(ParseFailedError);
    });

    it("should handle invalid confidence value", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "John",
                email: "john@test.com",
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: "Test",
                confidence: "invalid",
              }),
            },
          },
        ],
      });

      const result = await parseLeadText("John john@test.com", mockClient);

      // Should default to 0.5 for invalid confidence
      expect(result.confidence).toBe(0.5);
    });

    it("should clamp confidence to valid range", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "John",
                email: "john@test.com",
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: "Test",
                confidence: 1.5, // Out of range
              }),
            },
          },
        ],
      });

      const result = await parseLeadText("John john@test.com", mockClient);

      // Should default to 0.5 for out-of-range confidence
      expect(result.confidence).toBe(0.5);
    });
  });

  describe("API call parameters", () => {
    it("should call OpenAI with correct parameters", async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                name: "Test",
                email: "test@test.com",
                company: null,
                phone: null,
                budget: null,
                projectType: null,
                source: null,
                message: "Test",
                confidence: 0.8,
              }),
            },
          },
        ],
      });

      const testText = "Test lead text";
      await parseLeadText(testText, mockClient);

      expect(mockCreate).toHaveBeenCalledWith({
        model: "gpt-4o-mini",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining(testText),
          }),
        ]),
        temperature: 0.1,
        response_format: { type: "json_object" },
      });
    });
  });
});

// ============================================================================
// ERROR CLASS TESTS
// ============================================================================

describe("AIServiceError", () => {
  it("should have correct properties", () => {
    const error = new AIServiceError("Test message");
    expect(error.name).toBe("AIServiceError");
    expect(error.message).toBe("Test message");
    expect(error.code).toBe("AI_SERVICE_ERROR");
  });

  it("should use default message", () => {
    const error = new AIServiceError();
    expect(error.message).toBe("AI service temporarily unavailable");
  });
});

describe("ParseFailedError", () => {
  it("should have correct properties", () => {
    const parsed: ParsedLeadData = {
      name: null,
      email: null,
      company: null,
      phone: null,
      budget: null,
      projectType: null,
      source: null,
      message: null,
    };
    const error = new ParseFailedError(0.15, parsed);

    expect(error.name).toBe("ParseFailedError");
    expect(error.message).toBe("Could not extract lead information");
    expect(error.code).toBe("PARSE_FAILED");
    expect(error.confidence).toBe(0.15);
    expect(error.parsed).toBe(parsed);
  });
});
