if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for the full test suite; point it at the existing migrated local test database.')
  process.exitCode = 1
}
