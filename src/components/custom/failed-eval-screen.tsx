import Link from "next/link";
import { AlertIcon, RetryIcon } from "@/components/icons";
import type { FailureCode } from "@/db/schema";
import type { QuotaBlock } from "@/server/custom-quota";
import { CUSTOM_BLOCK, CUSTOM_LABEL, FAILED_EVAL, FAILURE_REASON } from "@/strings/product-strings";

type Props = {
  sessionId: string;
  topicText: string;
  failureCode: FailureCode;
  /** What stands in the way of another try, as on Màn 10; null when the learner can try again. */
  block: QuotaBlock | null;
  freeLeft: number;
  attemptsLeftToday: number;
};

/**
 * Màn 11 for a scenario that did not pass: the topic, the fixed sentence of the reason, what is
 * left of today's attempts, and "Thử lại", which opens Màn 10 with both fields filled in. Nothing
 * of what was generated is shown. When a limit stops another try, its sentence stands in place of
 * the button.
 */
export function FailedEvalScreen({ sessionId, topicText, failureCode, block, freeLeft, attemptsLeftToday }: Props) {
  return (
    <main className="center-page">
      <section className="card-lg gen-card failed-card">
        <div className="gen-top">
          <span className="failed-ic">
            <AlertIcon size={24} />
          </span>
          <span className="pill pill-outline">{CUSTOM_LABEL.light_check}</span>
        </div>
        <div>
          <h1 className="headline-md gen-topic">{FAILED_EVAL.title}</h1>
          {freeLeft > 0 && <p className="body-lg c-variant">{FAILED_EVAL.free_left}</p>}
        </div>
        <dl className="failed-facts">
          <div className="li">
            <dt className="label-sm c-outline">Chủ đề</dt>
            <dd className="body-md">{topicText}</dd>
          </div>
          <div className="li">
            <dt className="label-sm c-outline">Lý do</dt>
            <dd className="label-lg">{FAILURE_REASON[failureCode]}</dd>
          </div>
        </dl>
        <div className="failed-foot">
          <span className="body-sm c-variant">{block && block !== "running" ? CUSTOM_BLOCK[block] : `Còn ${attemptsLeftToday} lần thử hôm nay`}</span>
          <div className="failed-actions">
            <Link href="/my-sessions" className="btn-link">
              Về Buổi của tôi
            </Link>
            {(block === null || block === "running") && (
              <Link className="btn btn-primary btn-md" href={`/custom-topic?retry=${sessionId}`}>
                <RetryIcon size={16} />
                Thử lại
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
