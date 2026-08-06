// beforeAll in most suites does createTestApp() -> resetDatabase() -> seedBaseData().
// resetDatabase runs `synchronize(true)`, which drops and rebuilds the schema for
// every entity in AppModule; measured at ~130s on a local dev machine, so the old
// 30s cap failed every suite here before a single test ran.
//
// This is a hook budget, not a per-assertion one: an individual test that needs
// 3 minutes is still a bug worth looking at.
jest.setTimeout(180_000);
