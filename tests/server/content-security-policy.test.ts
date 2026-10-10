import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/server/content-security-policy";

const directives = (policy: string) => new Map(policy.split("; ").map((directive) => [directive.split(" ")[0], directive.split(" ").slice(1)]));
const production = (supabaseUrl: string | undefined = "https://abc.supabase.co") => directives(contentSecurityPolicy({ nonce: "Tm9uY2U=", supabaseUrl, dev: false }));

describe("contentSecurityPolicy", () => {
  it("runs scripts only with the request's nonce: no inline script, no eval, no other origin", () => {
    expect(production().get("script-src")).toEqual(["'self'", "'nonce-Tm9uY2U='", "'strict-dynamic'"]);
  });

  it("carries a different nonce for a different request", () => {
    const other = contentSecurityPolicy({ nonce: "T3RoZXI=", supabaseUrl: undefined, dev: false });
    expect(other).toContain("'nonce-T3RoZXI='");
    expect(other).not.toContain("Tm9uY2U=");
  });

  it("lets the browser load from and talk to this origin alone", () => {
    const policy = production();
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
    expect(policy.get("img-src")).toEqual(["'self'", "data:"]);
  });

  it("refuses framing, plugins and a changed base address", () => {
    const policy = production();
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
  });

  it("lets the sign-in form follow its redirects to the auth server and to Google, and nowhere else", () => {
    expect(production("https://abc.supabase.co/").get("form-action")).toEqual(["'self'", "https://abc.supabase.co", "https://accounts.google.com"]);
    expect(production("http://127.0.0.1:54321").get("form-action")).toEqual(["'self'", "http://127.0.0.1:54321", "https://accounts.google.com"]);
  });

  it("keeps forms on this origin when the auth server's address is missing or is no address", () => {
    expect(directives(contentSecurityPolicy({ nonce: "n", supabaseUrl: undefined, dev: false })).get("form-action")).toEqual(["'self'"]);
    expect(production("not a url").get("form-action")).toEqual(["'self'"]);
  });

  it("allows eval and the reload socket in development only", () => {
    const dev = directives(contentSecurityPolicy({ nonce: "n", supabaseUrl: undefined, dev: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toEqual(["'self'", "ws:"]);
    expect(production().get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("holds nothing an address could smuggle in: one line, no directive from the auth server's address", () => {
    const policy = contentSecurityPolicy({ nonce: "n", supabaseUrl: "https://abc.supabase.co/x; script-src *", dev: false });
    expect(policy).not.toMatch(/[\r\n]/u);
    expect(directives(policy).get("script-src")).toEqual(["'self'", "'nonce-n'", "'strict-dynamic'"]);
  });
});
