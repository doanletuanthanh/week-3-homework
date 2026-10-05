import { redirect } from "next/navigation";
import { AlertIcon, GoogleIcon } from "@/components/icons";
import { signInWithGoogle } from "@/server/actions";
import { getUser } from "@/server/auth";
import { safeNextPath } from "@/server/safe-next";

export const metadata = { title: "Đăng nhập · InterviewLab" };

/** Sign-in. Google is the only way in; `next` is where the learner continues afterwards. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getUser()) redirect(next);

  return (
    <main className="center-page">
      <section className="card-lg auth-card" aria-labelledby="signin-title">
        <span className="eyebrow">Trước khi bắt đầu</span>
        <h1 id="signin-title" className="headline-lg">
          Đăng nhập để luyện
        </h1>
        <p className="body-md c-variant">Buổi luyện được lưu vào tài khoản Google của bạn để bạn xem lại.</p>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn btn-primary btn-lg auth-button">
            <GoogleIcon />
            Đăng nhập với Google
          </button>
        </form>
        {params.error && (
          <p className="ferr" role="alert">
            <AlertIcon size={16} />
            Không đăng nhập được. Thử lại.
          </p>
        )}
      </section>
    </main>
  );
}
