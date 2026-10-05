import { AutoSubmitForm } from "@/components/auto-submit-form";
import { resumeAfterSignIn } from "@/server/actions";
import { requireAckedUser } from "@/server/auth";

export const metadata = { title: "Đang tiếp tục · InterviewLab" };

/**
 * Landing point after sign-in when the learner had started something (for example "Bắt đầu").
 * Loading this page changes nothing: the pending action runs only from the form's POST, and
 * only for the browser that holds its single-use token.
 */
export default async function ResumePage() {
  await requireAckedUser("/resume");

  return (
    <main className="center-page">
      <section className="card-lg auth-card">
        <h1 className="headline-md">Đang tiếp tục…</h1>
        <AutoSubmitForm action={resumeAfterSignIn}>
          <button type="submit" className="btn btn-primary btn-lg auth-button">
            Tiếp tục
          </button>
        </AutoSubmitForm>
      </section>
    </main>
  );
}
