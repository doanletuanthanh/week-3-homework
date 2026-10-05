import { notFound } from "next/navigation";
import { InterviewChat } from "@/components/interview/interview-chat";
import { PersonaAvatar } from "@/components/persona-avatar";
import { getDb } from "@/db/client";
import { getSession, listTurns } from "@/db/repo/sessions";
import { personaCard } from "@/scenario/persona-card";
import { requireAckedUser } from "@/server/auth";
import { isUuid } from "@/server/uuid";

export const metadata = { title: "Buổi phỏng vấn · InterviewLab" };

/** Màn 4 · Buổi phỏng vấn (walking skeleton: transcript and composer only). */
export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAckedUser(`/sessions/${id}`);
  if (!isUuid(id)) notFound();

  const db = getDb();
  const found = await getSession(db, user.id, id);
  if (!found) notFound();
  const turns = await listTurns(db, user.id, id);

  const persona = personaCard(found.scenario.content);

  return (
    <main className="container interview">
      <div className="interview-who">
        <PersonaAvatar size={48} />
        <div>
          <h1 className="label-lg">{persona.name}</h1>
          <p className="body-sm c-variant">{persona.tagline}</p>
        </div>
      </div>
      <InterviewChat
        sessionId={id}
        personaName={persona.displayNameCapitalized}
        initialTurns={turns.map((turn) => ({
          index: turn.index,
          learnerText: turn.learnerText,
          personaText: turn.personaText,
        }))}
      />
    </main>
  );
}
