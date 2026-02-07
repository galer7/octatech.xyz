/**
 * Test setup file for Vitest.
 *
 * This file runs before all tests and sets up the test environment.
 * For database tests, we use a separate test database.
 */

import { afterAll, beforeAll } from "vitest";

// Set test environment
process.env.NODE_ENV = "test";

// Use a test database URL if available, otherwise skip DB tests
if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
	console.warn("⚠️  No DATABASE_URL or TEST_DATABASE_URL set. Database tests will be skipped.");
}

beforeAll(async () => {
	// Any global setup can go here
});

afterAll(async () => {
	// Any global cleanup can go here
});
