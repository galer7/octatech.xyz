/**
 * OpenAI integration for AI-powered lead parsing.
 *
 * Uses GPT-4o-mini to extract structured lead data from natural language text.
 * Implements the AI lead parsing feature per specs/11-ai-features.md.
 */

import OpenAI from "openai";
import {
  budgetOptions,
  projectTypeOptions,
  type BudgetOption,
  type ProjectTypeOption,
} from "../validation";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of AI lead parsing operation.
 */
export interface ParsedLeadResult {
  /** Extracted lead data fields */
  parsed: ParsedLeadData;
  /** Overall confidence score (0-1) indicating extraction quality */
  confidence: number;
  /** List of fields that were successfully extracted */
  extractedFields: string[];
}

/**
 * Structured lead data extracted from natural language.
 */
export interface ParsedLeadData {
  /** Contact's full name */
  name: string | null;
  /** Email address */
  email: string | null;
  /** Company or organization name */
  company: string | null;
  /** Phone number in any format */
  phone: string | null;
  /** Budget range mapped to predefined options */
  budget: BudgetOption | null;
  /** Project type mapped to predefined options */
  projectType: ProjectTypeOption | null;
  /** How they found us */
  source: string | null;
  /** Brief summary of their needs/project */
  message: string | null;
}

/**
 * Raw response from OpenAI before validation.
 */
interface OpenAIParseResponse {
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  budget: string | null;
  projectType: string | null;
  source: string | null;
  message: string | null;
  confidence: number;
}

/**
 * Error thrown when AI service is unavailable.
 */
export class AIServiceError extends Error {
  public readonly code = "AI_SERVICE_ERROR";

  constructor(message = "AI service temporarily unavailable") {
    super(message);
    this.name = "AIServiceError";
  }
}

/**
 * Error thrown when parsing fails to extract meaningful data.
 */
export class ParseFailedError extends Error {
  public readonly code = "PARSE_FAILED";
  public readonly confidence: number;
  public readonly parsed: ParsedLeadData;

  constructor(confidence: number, parsed: ParsedLeadData) {
    super("Could not extract lead information");
    this.name = "ParseFailedError";
    this.confidence = confidence;
    this.parsed = parsed;
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * System prompt for lead data extraction.
 * Instructs the AI to extract structured lead information from natural language.
 */
const SYSTEM_PROMPT = `You are a lead data extraction assistant. Extract structured lead information from natural language text.

Return a JSON object with these fields (use null for missing/unclear values):
- name: Full name of the contact
- email: Email address
- company: Company or organization name
- phone: Phone number (any format)
- budget: Map to one of these options or null:
  - "Not sure yet"
  - "$5,000 - $15,000"
  - "$15,000 - $50,000"
  - "$50,000 - $100,000"
  - "$100,000+"
- projectType: Map to one of these options or null:
  - "New Product / MVP"
  - "Staff Augmentation"
  - "Legacy Modernization"
  - "Cloud Migration"
  - "Performance Optimization"
  - "Security Audit"
  - "Other"
- source: How they found us (e.g., "Google Search", "LinkedIn", "Referral", "Conference", etc.)
- message: A brief summary of their needs/project (1-2 sentences)
- confidence: A number 0-1 indicating overall extraction confidence

Only return valid JSON, no explanation.`;

/**
 * Default model for lead parsing.
 * GPT-4o-mini is cost-efficient and fast for this use case.
 */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Default temperature for consistent extraction.
 * Low temperature (0.1) ensures deterministic results.
 */
const DEFAULT_TEMPERATURE = 0.1;

/**
 * Minimum confidence threshold for successful parsing.
 * Below this threshold, we return a PARSE_FAILED error.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create an OpenAI client instance.
 * Uses OPENAI_API_KEY environment variable.
 *
 * @returns OpenAI client instance
 * @throws AIServiceError if API key is not configured
 */
export function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AIServiceError(
      "OpenAI API key not configured. Set OPENAI_API_KEY environment variable."
    );
  }

  return new OpenAI({ apiKey });
}

/**
 * Map a budget string from AI output to a valid budget option.
 * Handles various formats and normalizes to predefined options.
 *
 * @param budget - Budget string from AI response
 * @returns Matching BudgetOption or null
 */
export function mapBudgetToOption(budget: string | null): BudgetOption | null {
  if (!budget) return null;

  const normalized = budget.toLowerCase().trim();

  // Direct match (case-insensitive)
  const directMatch = budgetOptions.find(
    (opt) => opt.toLowerCase() === normalized
  );
  if (directMatch) return directMatch;

  // Check for "not sure" variants
  if (
    normalized.includes("not sure") ||
    normalized.includes("unsure") ||
    normalized.includes("unknown") ||
    normalized.includes("don't know") ||
    normalized.includes("tbd")
  ) {
    return "Not sure yet";
  }

  // Extract numeric value for range matching
  const numericMatch = normalized.match(/\$?(\d+)[,.]?(\d*)\s*k?/i);
  if (numericMatch) {
    let value = parseInt(numericMatch[1], 10);
    // Handle "k" suffix (e.g., "75k" = 75000)
    if (normalized.includes("k") && value < 1000) {
      value *= 1000;
    }
    // Handle missing "k" for values that look like thousands
    if (numericMatch[2] && numericMatch[2].length === 3) {
      // "75,000" format
      value = parseInt(numericMatch[1] + numericMatch[2], 10);
    }

    // Map to budget ranges
    if (value < 5000) return "Not sure yet";
    if (value >= 5000 && value < 15000) return "$5,000 - $15,000";
    if (value >= 15000 && value < 50000) return "$15,000 - $50,000";
    if (value >= 50000 && value < 100000) return "$50,000 - $100,000";
    if (value >= 100000) return "$100,000+";
  }

  // Check for range mentions
  if (normalized.includes("5") && normalized.includes("15")) {
    return "$5,000 - $15,000";
  }
  if (normalized.includes("15") && normalized.includes("50")) {
    return "$15,000 - $50,000";
  }
  if (normalized.includes("50") && normalized.includes("100")) {
    return "$50,000 - $100,000";
  }
  if (
    normalized.includes("100") ||
    normalized.includes("enterprise") ||
    normalized.includes("large")
  ) {
    return "$100,000+";
  }

  return null;
}

/**
 * Map a project type string from AI output to a valid option.
 * Handles various formats and normalizes to predefined options.
 *
 * @param projectType - Project type string from AI response
 * @returns Matching ProjectTypeOption or null
 */
export function mapProjectTypeToOption(
  projectType: string | null
): ProjectTypeOption | null {
  if (!projectType) return null;

  const normalized = projectType.toLowerCase().trim();

  // Direct match (case-insensitive)
  const directMatch = projectTypeOptions.find(
    (opt) => opt.toLowerCase() === normalized
  );
  if (directMatch) return directMatch;

  // Keyword-based matching
  if (
    normalized.includes("mvp") ||
    normalized.includes("new product") ||
    normalized.includes("startup") ||
    normalized.includes("build from scratch") ||
    normalized.includes("greenfield")
  ) {
    return "New Product / MVP";
  }

  if (
    normalized.includes("staff") ||
    normalized.includes("augment") ||
    normalized.includes("contractor") ||
    normalized.includes("developer") ||
    normalized.includes("engineer") ||
    normalized.includes("team extension")
  ) {
    return "Staff Augmentation";
  }

  if (
    normalized.includes("legacy") ||
    normalized.includes("moderniz") ||
    normalized.includes("refactor") ||
    normalized.includes("rewrite") ||
    normalized.includes("upgrade")
  ) {
    return "Legacy Modernization";
  }

  if (
    normalized.includes("cloud") ||
    normalized.includes("migration") ||
    normalized.includes("aws") ||
    normalized.includes("azure") ||
    normalized.includes("gcp")
  ) {
    return "Cloud Migration";
  }

  if (
    normalized.includes("performance") ||
    normalized.includes("optimization") ||
    normalized.includes("speed") ||
    normalized.includes("slow") ||
    normalized.includes("scale") ||
    normalized.includes("scaling")
  ) {
    return "Performance Optimization";
  }

  if (
    normalized.includes("security") ||
    normalized.includes("audit") ||
    normalized.includes("penetration") ||
    normalized.includes("vulnerability") ||
    normalized.includes("compliance")
  ) {
    return "Security Audit";
  }

  return "Other";
}

/**
 * Validate and clean the parsed response from OpenAI.
 * Ensures all fields are properly typed and mapped to valid options.
 *
 * @param raw - Raw parsed response from OpenAI
 * @returns Validated and cleaned ParsedLeadData
 */
function validateAndCleanResponse(raw: OpenAIParseResponse): ParsedLeadData {
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null,
    email:
      typeof raw.email === "string" && raw.email.includes("@")
        ? raw.email.trim().toLowerCase()
        : null,
    company:
      typeof raw.company === "string" && raw.company.trim()
        ? raw.company.trim()
        : null,
    phone:
      typeof raw.phone === "string" && raw.phone.trim()
        ? raw.phone.trim()
        : null,
    budget: mapBudgetToOption(raw.budget),
    projectType: mapProjectTypeToOption(raw.projectType),
    source:
      typeof raw.source === "string" && raw.source.trim()
        ? raw.source.trim()
        : null,
    message:
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message.trim()
        : null,
  };
}

/**
 * Get list of fields that were successfully extracted.
 *
 * @param parsed - Parsed lead data
 * @returns Array of field names that have non-null values
 */
function getExtractedFields(parsed: ParsedLeadData): string[] {
  const fields: string[] = [];

  if (parsed.name) fields.push("name");
  if (parsed.email) fields.push("email");
  if (parsed.company) fields.push("company");
  if (parsed.phone) fields.push("phone");
  if (parsed.budget) fields.push("budget");
  if (parsed.projectType) fields.push("projectType");
  if (parsed.source) fields.push("source");
  if (parsed.message) fields.push("message");

  return fields;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Parse natural language text into structured lead data using OpenAI.
 *
 * This function takes free-form text (e.g., email content, notes, chat messages)
 * and extracts structured lead information including contact details, budget,
 * project type, and a summary message.
 *
 * @param text - Natural language text to parse (max 5000 characters)
 * @param client - Optional OpenAI client (creates new one if not provided)
 * @returns Parsed lead result with data, confidence, and extracted fields
 * @throws AIServiceError if OpenAI API is unavailable or fails
 * @throws ParseFailedError if confidence is below threshold
 *
 * @example
 * ```ts
 * const result = await parseLeadText(
 *   "Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc. " +
 *   "They're looking for help with their cloud migration, budget around $75k."
 * );
 * // result.parsed.name = "Sarah Chen"
 * // result.parsed.email = "sarah@techstartup.io"
 * // result.parsed.budget = "$50,000 - $100,000"
 * // result.confidence = 0.92
 * ```
 */
export async function parseLeadText(
  text: string,
  client?: OpenAI
): Promise<ParsedLeadResult> {
  const openai = client ?? createOpenAIClient();

  const userPrompt = `Extract lead information from this text:

"""
${text}
"""`;

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: DEFAULT_TEMPERATURE,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new AIServiceError("Empty response from OpenAI");
    }

    // Parse JSON response
    let raw: OpenAIParseResponse;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new AIServiceError("Invalid JSON response from OpenAI");
    }

    // Validate confidence is a number
    const confidence =
      typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
        ? raw.confidence
        : 0.5;

    // Clean and validate parsed data
    const parsed = validateAndCleanResponse(raw);
    const extractedFields = getExtractedFields(parsed);

    // Check if parsing was successful enough
    if (confidence < MIN_CONFIDENCE_THRESHOLD || extractedFields.length === 0) {
      throw new ParseFailedError(confidence, parsed);
    }

    return {
      parsed,
      confidence,
      extractedFields,
    };
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof AIServiceError || error instanceof ParseFailedError) {
      throw error;
    }

    // Handle OpenAI-specific errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        throw new AIServiceError("Invalid OpenAI API key");
      }
      if (error.status === 429) {
        throw new AIServiceError("OpenAI rate limit exceeded. Please try again later.");
      }
      if (error.status && error.status >= 500) {
        throw new AIServiceError("OpenAI service temporarily unavailable");
      }
      throw new AIServiceError(`OpenAI API error: ${error.message}`);
    }

    // Handle network errors
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      throw new AIServiceError("Unable to connect to OpenAI API");
    }

    // Generic error
    throw new AIServiceError(
      error instanceof Error ? error.message : "Unknown error during AI parsing"
    );
  }
}

/**
 * Check if OpenAI API is configured and available.
 *
 * @returns true if API key is set
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
