import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getTranscript } from "@/server/admin/learners";
import { requireAdmin } from "@/server/auth";

/**
 * A session turn by turn, the same fields `pnpm il trace` prints. Opening it is logged
 * (`read_transcript`). Learner text is rendered as text, never as markup.
 */
export default async function AdminSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  const transcript = await getTranscript(getDb(), user, id);
  if (!transcript) notFound();

  return (
    <>
      <div className="adm-stack">
        <Link href={`/admin/learners/${transcript.userId}`} className="btn-link">
          ← Người học
        </Link>
        <h1 className="headline-lg">Bản ghi buổi</h1>
        <p className="adm-mono c-variant">{transcript.title}</p>
      </div>
      {transcript.turns.map((turn) => (
        <section key={turn.index} className="card adm-panel" aria-label={turn.title}>
          <h2 className="headline-sm">{turn.title}</h2>
          <dl className="adm-trace">
            {turn.lines.map((line, position) => (
              <div key={position}>
                {line.label && <dt>{line.label}</dt>}
                <dd>
                  {!line.items ? (
                    line.text
                  ) : line.items.length === 0 ? (
                    "(không)"
                  ) : (
                    <ul className="adm-list">
                      {line.items.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
