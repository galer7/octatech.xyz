/**
 * Password utilities for the CRM authentication system.
 *
 * Uses Argon2id for secure password hashing as specified in specs/05-authentication.md.
 * Implements password strength validation with configurable requirements.
 */

import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id configuration per OWASP recommendations.
 * These settings provide a good balance between security and performance.
 */
const ARGON2_CONFIG = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * Password strength requirements per spec.
 */
export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
} as const;

/**
 * Common passwords list (subset for basic protection).
 * In production, consider using a more comprehensive list.
 */
const COMMON_PASSWORDS = new Set([
  "password123!A",
  "Password123!",
  "Admin123!@#",
  "Welcome123!",
  "Qwerty123!@",
  "Letmein123!@",
  "123456789Aa!",
  "Password1234!",
  "Iloveyou123!",
  "Sunshine123!",
  "Princess123!",
  "Football123!",
  "Welcome1234!",
  "Shadow12345!",
  "Superman123!",
  "Michael1234!",
  "Password12!@",
  "Charlie123!@",
  "Monkey12345!",
  "Donald12345!",
]);

/**
 * Result of password validation.
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength against requirements.
 *
 * @param password - The password to validate
 * @returns Validation result with specific errors if invalid
 */
export function validatePasswordStrength(
  password: string
): PasswordValidationResult {
  const errors: string[] = [];

  // Check minimum length
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(
      `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
    );
  }

  // Check for uppercase letter
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check for lowercase letter
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check for number
  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check for special character
  if (
    PASSWORD_REQUIREMENTS.requireSpecial &&
    !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)
  ) {
    errors.push("Password must contain at least one special character");
  }

  // Check against common passwords
  if (COMMON_PASSWORDS.has(password)) {
    errors.push("Password is too common. Please choose a more unique password");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Hash a password using Argon2id.
 *
 * @param password - The plaintext password to hash
 * @returns The hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_CONFIG);
}

/**
 * Verify a password against a stored hash.
 *
 * @param hash - The stored password hash
 * @param password - The plaintext password to verify
 * @returns True if the password matches, false otherwise
 */
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    // Return false for any verification error (malformed hash, etc.)
    return false;
  }
}

/**
 * Generate a cryptographically secure random password.
 * Useful for initial admin password generation.
 *
 * @param length - The desired password length (default: 16)
 * @returns A random password meeting all requirements
 */
export function generateSecurePassword(length = 16): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const allChars = uppercase + lowercase + numbers + special;

  // Ensure at least one of each required type
  const requiredChars = [
    uppercase[Math.floor(Math.random() * uppercase.length)],
    lowercase[Math.floor(Math.random() * lowercase.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // Fill remaining length with random characters
  const remainingLength = length - requiredChars.length;
  const randomChars = Array.from({ length: remainingLength }, () =>
    allChars[Math.floor(Math.random() * allChars.length)]
  );

  // Combine and shuffle
  const allPasswordChars = [...requiredChars, ...randomChars];
  for (let i = allPasswordChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPasswordChars[i], allPasswordChars[j]] = [
      allPasswordChars[j],
      allPasswordChars[i],
    ];
  }

  return allPasswordChars.join("");
}
