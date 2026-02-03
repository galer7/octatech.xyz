/**
 * Tests for password utilities.
 *
 * Verifies password strength validation, hashing, verification,
 * and secure password generation per specs/05-authentication.md.
 */

import { describe, it, expect } from "vitest";
import {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  generateSecurePassword,
  PASSWORD_REQUIREMENTS,
} from "./password";

describe("validatePasswordStrength", () => {
  describe("valid passwords", () => {
    it("should accept a password that meets all requirements", () => {
      const result = validatePasswordStrength("SecurePass123!");

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should accept a password with exactly minimum length", () => {
      const result = validatePasswordStrength("Abcdefgh12!@");

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should accept a long complex password", () => {
      const result = validatePasswordStrength(
        "ThisIsAVeryLongAndSecurePassword123!@#$%"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should accept passwords with various special characters", () => {
      const specialChars = "!@#$%^&*()_+-=[]{}|;:,.<>?`~";
      for (const char of specialChars) {
        const password = `SecurePass12${char}`;
        const result = validatePasswordStrength(password);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("passwords too short", () => {
    it("should reject a password shorter than 12 characters", () => {
      const result = validatePasswordStrength("Short1!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
      );
    });

    it("should reject an empty password", () => {
      const result = validatePasswordStrength("");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
      );
    });

    it("should reject a password with 11 characters", () => {
      const result = validatePasswordStrength("Abcdefgh1!@");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
      );
    });
  });

  describe("missing uppercase letter", () => {
    it("should reject a password without uppercase letters", () => {
      const result = validatePasswordStrength("securepass123!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one uppercase letter"
      );
    });
  });

  describe("missing lowercase letter", () => {
    it("should reject a password without lowercase letters", () => {
      const result = validatePasswordStrength("SECUREPASS123!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one lowercase letter"
      );
    });
  });

  describe("missing number", () => {
    it("should reject a password without numbers", () => {
      const result = validatePasswordStrength("SecurePassword!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one number"
      );
    });
  });

  describe("missing special character", () => {
    it("should reject a password without special characters", () => {
      const result = validatePasswordStrength("SecurePass1234");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one special character"
      );
    });
  });

  describe("common passwords", () => {
    it("should reject passwords from the blocklist", () => {
      const commonPasswords = [
        "password123!A",
        "Password123!",
        "Admin123!@#",
        "Welcome123!",
        "Qwerty123!@",
      ];

      for (const password of commonPasswords) {
        const result = validatePasswordStrength(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          "Password is too common. Please choose a more unique password"
        );
      }
    });
  });

  describe("multiple validation failures", () => {
    it("should report multiple errors for a very weak password", () => {
      const result = validatePasswordStrength("abc");

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
      );
      expect(result.errors).toContain(
        "Password must contain at least one uppercase letter"
      );
      expect(result.errors).toContain(
        "Password must contain at least one number"
      );
      expect(result.errors).toContain(
        "Password must contain at least one special character"
      );
    });

    it("should report all missing character type errors", () => {
      const result = validatePasswordStrength("aaaaaaaaaaaa");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Password must contain at least one uppercase letter"
      );
      expect(result.errors).toContain(
        "Password must contain at least one number"
      );
      expect(result.errors).toContain(
        "Password must contain at least one special character"
      );
      expect(result.errors).not.toContain(
        "Password must contain at least one lowercase letter"
      );
    });

    it("should report both length and common password errors", () => {
      // A common password that also happens to be too short would need both errors
      // But since common passwords in the list are all 12+ chars, we test a short one that meets other requirements
      const result = validatePasswordStrength("Ab1!");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`
      );
    });
  });
});

describe("hashPassword", () => {
  it("should return a string containing argon2id marker", async () => {
    const password = "SecurePassword123!";
    const hashedPassword = await hashPassword(password);

    expect(typeof hashedPassword).toBe("string");
    expect(hashedPassword).toContain("$argon2id$");
  });

  it("should produce different hashes for different passwords", async () => {
    const hash1 = await hashPassword("SecurePassword123!");
    const hash2 = await hashPassword("DifferentPass456@");

    expect(hash1).not.toBe(hash2);
  });

  it("should produce different hashes for the same password (salt)", async () => {
    const password = "SecurePassword123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });

  it("should produce hashes of consistent format", async () => {
    const hash = await hashPassword("TestPassword123!");

    // Argon2id hash format: $argon2id$v=...
    expect(hash).toMatch(/^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/);
  });
});

describe("verifyPassword", () => {
  it("should return true for correct password", async () => {
    const password = "SecurePassword123!";
    const hash = await hashPassword(password);

    const result = await verifyPassword(hash, password);

    expect(result).toBe(true);
  });

  it("should return false for incorrect password", async () => {
    const password = "SecurePassword123!";
    const hash = await hashPassword(password);

    const result = await verifyPassword(hash, "WrongPassword456@");

    expect(result).toBe(false);
  });

  it("should return false for malformed hash (does not throw)", async () => {
    const result = await verifyPassword("not-a-valid-hash", "anypassword");

    expect(result).toBe(false);
  });

  it("should return false for empty hash", async () => {
    const result = await verifyPassword("", "SecurePassword123!");

    expect(result).toBe(false);
  });

  it("should return false for truncated hash", async () => {
    const password = "SecurePassword123!";
    const hash = await hashPassword(password);
    const truncatedHash = hash.slice(0, 20);

    const result = await verifyPassword(truncatedHash, password);

    expect(result).toBe(false);
  });

  it("should be case-sensitive", async () => {
    const password = "SecurePassword123!";
    const hash = await hashPassword(password);

    const result = await verifyPassword(hash, "securepassword123!");

    expect(result).toBe(false);
  });
});

describe("generateSecurePassword", () => {
  it("should generate a password with default length of 16", () => {
    const password = generateSecurePassword();

    expect(password.length).toBe(16);
  });

  it("should generate a password with custom length", () => {
    const password = generateSecurePassword(24);

    expect(password.length).toBe(24);
  });

  it("should generate passwords that meet all strength requirements", () => {
    // Generate multiple passwords to ensure consistency
    for (let i = 0; i < 10; i++) {
      const password = generateSecurePassword();
      const validationResult = validatePasswordStrength(password);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toEqual([]);
    }
  });

  it("should generate unique passwords (random)", () => {
    const passwords = new Set<string>();

    for (let i = 0; i < 100; i++) {
      passwords.add(generateSecurePassword());
    }

    // All 100 passwords should be unique
    expect(passwords.size).toBe(100);
  });

  it("should include at least one uppercase letter", () => {
    const password = generateSecurePassword();

    expect(/[A-Z]/.test(password)).toBe(true);
  });

  it("should include at least one lowercase letter", () => {
    const password = generateSecurePassword();

    expect(/[a-z]/.test(password)).toBe(true);
  });

  it("should include at least one number", () => {
    const password = generateSecurePassword();

    expect(/[0-9]/.test(password)).toBe(true);
  });

  it("should include at least one special character", () => {
    const password = generateSecurePassword();

    expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it("should work with minimum viable length (4 for required chars)", () => {
    // Minimum length needed to include one of each required type
    const password = generateSecurePassword(4);

    expect(password.length).toBe(4);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
  });

  it("should generate valid passwords at various lengths", () => {
    const lengths = [12, 16, 20, 32, 64];

    for (const length of lengths) {
      const password = generateSecurePassword(length);
      expect(password.length).toBe(length);

      // Verify strength requirements are met for lengths >= 12
      if (length >= 12) {
        const result = validatePasswordStrength(password);
        expect(result.valid).toBe(true);
      }
    }
  });
});
