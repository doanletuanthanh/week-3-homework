"use client";

import { useEffect } from "react";
import { topicOpened } from "@/server/actions";

/**
 * Tells the server that a topic's page is on the learner's screen (the "mở chủ đề" event). Sent
 * from the browser, not written while the page renders: the server also renders the page to
 * prefetch it and to refresh it, and neither is the learner opening the topic.
 */
export function TopicOpened({ topicId }: { topicId: string }) {
  useEffect(() => {
    // Nothing to tell the learner when this fails: the page they asked for is in front of them.
    topicOpened(topicId).catch(() => {});
  }, [topicId]);
  return null;
}
