import Link from "next/link";

/**
 * The one 404 page of the app, for a URL nothing serves and for a page that calls `notFound()`
 * without a 404 page of its own, the admin area among them: both must look the same, so a
 * visitor cannot tell a hidden page from a missing one.
 */
export default function NotFound() {
  return (
    <main className="center-page">
      <section className="card-lg auth-card">
        <h1 className="headline-md">Không tìm thấy trang này.</h1>
        <Link className="btn btn-primary btn-lg auth-button" href="/">
          Về trang chủ
        </Link>
      </section>
    </main>
  );
}
