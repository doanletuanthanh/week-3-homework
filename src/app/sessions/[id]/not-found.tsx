import Link from "next/link";

/** The same page whether the session does not exist or belongs to another learner. */
export default function SessionNotFound() {
  return (
    <main className="center-page">
      <section className="card-lg auth-card">
        <h1 className="headline-md">Không tìm thấy buổi này.</h1>
        <Link className="btn btn-primary btn-lg auth-button" href="/my-sessions">
          Buổi của tôi
        </Link>
      </section>
    </main>
  );
}
