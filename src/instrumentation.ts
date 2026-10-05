/**
 * Runs once when a server instance starts. Loading the env here makes a bad configuration
 * (for example an email in both ADMIN_EMAILS and DEMO_ACCOUNT_EMAILS) stop the server
 * instead of surfacing on the first request that happens to read it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/config/env");
    try {
      getEnv();
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  }
}
