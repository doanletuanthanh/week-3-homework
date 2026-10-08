import type { DiagnosisKey, ReplaySelection } from "./reveal-types";

/**
 * The fixed line a replay offer opens with (PRD Màn 6 item 2). The moment itself was chosen
 * before any model ran; the verifier only decides how sure the wording may be.
 *
 * `verifierAgrees` is the verifier's answer about the moment: that the hook was ignored (primary)
 * or that the added words were new (fallback 1). A verifier that disagreed, failed or did not
 * answer counts as not agreeing. `notesMatchTarget` is false for empty notes, for notes that do
 * not match the target, and when the notes could not be judged.
 */
export function diagnose(input: {
  level: ReplaySelection["level"];
  verifierAgrees: boolean;
  notesMatchTarget: boolean;
}): DiagnosisKey | null {
  const { level, verifierAgrees, notesMatchTarget } = input;
  if (level === "none") return null;
  if (level === "fallback1") return verifierAgrees ? "added_own_idea" : "try_differently";
  if (!verifierAgrees) return "try_from_here";
  return notesMatchTarget ? "heard_not_followed" : "changed_topic";
}
