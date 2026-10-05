import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { llmCalls, pendingActions, sessions, turns, users } from "@/db/schema";
import { LOCAL_DATABASE_URL } from "../../helpers/local-stack";

process.env.DATABASE_URL = LOCAL_DATABASE_URL;

/** Read-only views of what the app wrote, for assertions. */
export const db = {
  user: async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0],
  sessionsOf: (userId: string) => getDb().select().from(sessions).where(eq(sessions.userId, userId)),
  turnsOf: (sessionId: string) => getDb().select().from(turns).where(eq(turns.sessionId, sessionId)).orderBy(turns.index),
  llmCallsOf: (sessionId: string) =>
    getDb().select().from(llmCalls).where(eq(llmCalls.sessionId, sessionId)).orderBy(llmCalls.createdAt),
  pendingActions: () => getDb().select().from(pendingActions),
};
