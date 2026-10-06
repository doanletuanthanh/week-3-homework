import { CliError } from "./scenario-file";

/**
 * Who is running the CLI, for the audit columns (`config.updated_by`, `admin_access_log`). The
 * CLI has no sign-in, so the operator names themselves in OPERATOR_EMAIL; the address must be
 * one of ADMIN_EMAILS.
 */
export function operatorEmail(env: Record<string, string | undefined> = process.env): string {
  const email = env.OPERATOR_EMAIL?.trim().toLowerCase();
  if (!email) throw new CliError("Lệnh này cần biết ai đang chạy: đặt OPERATOR_EMAIL trong .env.local.");
  const admins = (env.ADMIN_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase());
  if (!admins.includes(email)) throw new CliError(`OPERATOR_EMAIL "${email}" không có trong ADMIN_EMAILS.`);
  return email;
}
