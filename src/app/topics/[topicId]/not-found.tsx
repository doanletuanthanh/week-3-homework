import Link from "next/link";
import { TOPIC } from "@/strings/product-strings";

/** The same page whether the topic does not exist or is another learner's own. */
export default function TopicNotFound() {
  return (
    <main className="center-page">
      <section className="card-lg auth-card">
        <h1 className="headline-md">{TOPIC.not_found}</h1>
        <Link className="btn btn-primary btn-lg auth-button" href="/library">
          {TOPIC.to_library}
        </Link>
      </section>
    </main>
  );
}
