"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { GENERATION_POLL_MS } from "@/config/limits";
import type { AttemptStep } from "@/db/schema";
import { CUSTOM_LABEL, GENERATING, GENERATING_STEP } from "@/strings/product-strings";

type Props = { attemptId: string; topicText: string; initialStep: AttemptStep | null };

/** The steps in the order the runner goes through them, one per line of the screen. */
const STEP_ORDER: AttemptStep[] = ["generating", "validating"];

/** Polls that fail this many times in a row before the screen says so. */
const FAILURES_BEFORE_ERROR = 3;

/**
 * Màn 11 while the scenario is prepared: the topic the learner typed and the two steps, and
 * nothing of what is generated. It asks every two seconds where the attempt is. When it passed,
 * the tab title says so and the page goes on to the prep screen of the new persona; when it did
 * not, the server renders the reason. Closing the page stops nothing.
 */
export function GeneratingScreen({ attemptId, topicText, initialStep }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<AttemptStep>(initialStep ?? "generating");
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const response = await fetch(`/api/custom-topics/${attemptId}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (stopped) return;
        if (body.redirectTo) return window.location.assign(body.redirectTo);
        if (!response.ok) throw new Error("attempt poll failed");
        setFailures(0);
        if (body.outcome === "passed" && body.personaId) {
          document.title = GENERATING.ready_title;
          return router.replace(`/prep/${body.personaId}`);
        }
        // Over without a scenario: the session's URL now renders why.
        if (body.outcome !== "running") return router.refresh();
        if (body.step) setStep(body.step);
      } catch {
        if (!stopped) setFailures((count) => count + 1);
      }
      if (!stopped) timer = setTimeout(() => void poll(), GENERATION_POLL_MS);
    }
    let timer = setTimeout(() => void poll(), GENERATION_POLL_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [attemptId, router]);

  const current = STEP_ORDER.indexOf(step);

  return (
    <main className="center-page">
      <section className="card-lg gen-card">
        <div className="gen-top">
          <span className="eyebrow">Đang chuẩn bị kịch bản</span>
          <span className="pill pill-outline">{CUSTOM_LABEL.light_check}</span>
        </div>
        <h1 className="headline-md gen-topic">“{topicText}”</h1>
        <ol className="gen-steps" aria-label="Tiến độ">
          {STEP_ORDER.map((name, index) => (
            <li key={name} className={`step-row${index === current ? " now" : ""}`} aria-current={index === current ? "step" : undefined} data-state={index < current ? "done" : index === current ? "now" : "todo"}>
              {index < current ? (
                <span className="check">
                  <CheckIcon size={12} strokeWidth={3} />
                </span>
              ) : index === current ? (
                <span className="spin" aria-hidden="true" />
              ) : (
                <span className="gen-dot" aria-hidden="true" />
              )}
              <span className="label-lg">{GENERATING_STEP[name]}</span>
            </li>
          ))}
        </ol>
        <p className="note-box note-info body-sm" role="status">
          {GENERATING.note}
        </p>
        {failures >= FAILURES_BEFORE_ERROR && (
          <p className="ferr" role="alert">
            <AlertIcon size={16} />
            Không kết nối được. Đang thử lại.
          </p>
        )}
      </section>
    </main>
  );
}
