import type { BrowserContext, Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { LOCAL_SUPABASE_URL } from "../../helpers/local-stack";

const PASSWORD = "e2e-local-password";

function adminClient() {
  return createClient(LOCAL_SUPABASE_URL, process.env.E2E_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates an account in local Supabase Auth. Google cannot be driven from a test, so the
 * account is marked the way the auth server marks a Google sign-in (`app_metadata.provider`),
 * using the admin API. The app is not changed for tests: it verifies a real signed token.
 */
export async function createAccount(email: string, options: { provider?: "google" | "email" } = {}): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { email_verified: true },
  });
  if (error) throw error;
  if ((options.provider ?? "google") === "google") {
    const updated = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { provider: "google", providers: ["google"] },
    });
    if (updated.error) throw updated.error;
  }
  return data.user.id;
}

/** Signs the account in and gives the browser the same session cookies the app's own sign-in sets. */
export async function signIn(context: BrowserContext, email: string): Promise<void> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(LOCAL_SUPABASE_URL, process.env.E2E_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;

  await context.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      sameSite: "Lax" as const,
    })),
  );
}

/** A fresh Google-marked learner, signed in. Returns the auth user id. */
export async function signInAsNewLearner(context: BrowserContext, email: string): Promise<string> {
  const id = await createAccount(email);
  await signIn(context, email);
  return id;
}

let counter = 0;
/** A unique address per call, so tests never share an account. */
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}@example.com`;
}

/** The auth id of an account that exists; creates it when it does not. For accounts several specs share. */
export async function ensureAccount(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email === email)?.id ?? createAccount(email);
}

/** A fresh Google-marked learner who has accepted the data notice, with the page on `next`. */
export async function signInAndAccept(page: Page, context: BrowserContext, label: string, next: string = "/my-sessions") {
  const email = uniqueEmail(label);
  const userId = await signInAsNewLearner(context, email);
  await page.goto(`/data-notice?next=${next}`);
  await page.getByRole("button", { name: "Tôi hiểu" }).click();
  await page.waitForURL((url) => url.pathname === next);
  return { userId, email };
}
