const TEST_BRANCH = "test";

export function assertTestDatabaseEnvironment(): void {
  if (process.env.NEON_BRANCH !== TEST_BRANCH) {
    throw new Error(
      `Unsafe test database configuration: expected NEON_BRANCH=${TEST_BRANCH}, received ${process.env.NEON_BRANCH ?? "unset"}.`,
    );
  }

  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_UNPOOLED) {
    throw new Error(
      "Unsafe test database configuration: DATABASE_URL and DATABASE_URL_UNPOOLED are required.",
    );
  }
}
