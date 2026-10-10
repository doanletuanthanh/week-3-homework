---
title: "Phase 3: Topic screen and persona cards"
status: done
phase: 3
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 3: Topic screen and persona cards

## Overview

Màn 2b at `/topics/[topicId]`: the topic, the overlap warning, and one card per playable persona with the button that fits the learner's session. The prep screen's breadcrumb and avatar follow.

## Context links

- PRD §6.1 Màn 2b and Màn 3, §7 (table and the notes under it), FR-4, FR-5, FR-45, FR-51. Artboard `Topic`.
- Existing: `src/app/prep/[personaId]/page.tsx` (persona head, demo "Bắt đầu buổi mới", `continueSession`), `src/scenario/persona-card.ts`, `src/components/persona-avatar.tsx`, `src/app/sessions/[id]/not-found.tsx`.

## Requirements

- Functional:
  - Guests can read the page. A signed-in learner opening it writes `topic_opened`; a guest's visit writes nothing (user decision 2026-10-10).
<!-- Updated: Validation Session 1 - topic_opened for signed-in learners only -->
  - Header: breadcrumb "Thư viện › [title]", role label, "n persona", title, summary, and signed-in "Bạn đã luyện k/n".
  - Warning (FR-51), exact string: "Nếu đồ án của bạn cũng về chủ đề này, điều các nhân vật ở đây kể có thể thành giả thuyết trong đầu bạn trước khi gặp người thật. Họ là nhân vật hư cấu, không phải người dùng của bạn."
  - Persona card: state label ("Sẵn sàng" / "Đang làm dở" / "Đã luyện · dd/mm"), avatar, name, tagline, "Câu hỏi nghiên cứu" + the question, "Niêm phong · Đang giữ N điều chưa nói", and the button: no session → "Bắt đầu" → `/prep/[personaId]`; in progress → "Tiếp tục buổi luyện" → `/sessions/[id]` (which renders the right screen, and Màn 3 when no question was asked); done → "Xem lại kết quả" → `/sessions/[id]`.
  - Demo account: also "Bắt đầu buổi mới" on every card; the main button points to the newest session.
  - A pulled persona is not shown. A custom topic adds "Kịch bản do AI sinh, chỉ qua kiểm tra nhẹ. Mọi chi tiết là hư cấu." and has no role label.
  - Empty: no playable persona → "Chủ đề này đang được cập nhật." and a button to the library.
  - Not found: unknown topic, or another learner's custom topic → HTTP 404 with "Không tìm thấy chủ đề này." and a button to the library. The two cases are not told apart.
  - Prep screen: breadcrumb becomes "Thư viện › [topic, linked] › [persona]" for curated; custom keeps "Buổi của tôi".
  - A persona without an illustration shows its initial (PRD Màn 2b says so for generated personas).
- Non-functional:
  - The card receives the item count as a number. No item field reaches the component props.
  - Card buttons are links; starting a session stays on Màn 3, so no new write path is added here.

## Architecture

- `src/app/topics/[topicId]/page.tsx`: `getTopicWithPersonas` → `notFound()` on null; signed-in, `listSessionsForPersonas`; map with `personaButton`. Suspense boundary and skeleton after the not-found check, as the bootstrap plan decided for every page.
- `src/app/topics/[topicId]/not-found.tsx`, modelled on the session one.
- `topic_opened` is reported from the browser: `src/components/library/topic-opened.tsx` (a client effect) calls the server action `topicOpened`, which runs `reportTopicOpened` in `src/server/library.ts`. See the notes below for why it is not written in the render.
<!-- Updated: Phase 3 implementation - event reported by a client effect, not in the render -->
- `src/components/library/persona-card.tsx`; `src/components/topic-warning.tsx` holding the FR-51 string once.
- `PersonaAvatar` takes `{ size, avatarKey, name }`: `avatarKey === "thu"` (the key in `chi-thu.json`) → the existing drawing; otherwise a circle with the first letter of the given name on a tone chosen by a hash of the name from the theme's neutral tokens. All existing call sites pass the two new props.
- "Bắt đầu buổi mới" for demo accounts reuses the form and action of the prep page; move that small form to `src/components/start-session-button.tsx` if it is not already shared.

## Related code files

- Create: `src/app/topics/[topicId]/page.tsx`, `src/app/topics/[topicId]/not-found.tsx`, `src/components/library/persona-card.tsx`, `src/components/library/topic-opened.tsx`, `src/components/topic-warning.tsx`, `tests/e2e/topic.spec.ts`, `tests/components/topic-screen.test.tsx`
- Also modified in the implementation: `src/db/repo/library.ts` (`getVisibleTopic`), `src/db/repo/sessions.ts`, `src/server/library.ts` (`toPersonaCardView`, `reportTopicOpened`), `src/server/actions.ts`, `src/server/session-list.ts`, `src/server/session-view.ts`, `src/scenario/persona-card.ts` (`personaInitial`), `src/components/start-session-button.tsx`, `src/components/library/topic-card.tsx`, and the tests of each
- Modify: `src/components/persona-avatar.tsx` and its four call sites (`src/app/page.tsx`, `src/app/prep/[personaId]/page.tsx`, `src/components/interview/session-bar.tsx`, `src/components/sessions/session-row.tsx`), `src/app/prep/[personaId]/page.tsx` (breadcrumb, avatar), `src/strings/product-strings.ts`, `src/app/globals.css`, `src/components/ui/page-skeletons.tsx` (`TopicSkeleton`), `tests/e2e/guest.spec.ts`

## Implementation steps

1. Page, not-found, skeleton.
2. Persona card from the artboard; state label and button from `personaButton`.
3. Demo account button; e2e with a demo user.
4. Avatar change across the four call sites; visual check of the interview bar and the session rows. The new personas have no `avatar_key`, so they get the initial.
5. Prep breadcrumb.
6. `tests/e2e/topic.spec.ts`: guest reads the page and reaches prep; each §7 state gives the right button and target (seed sessions through `tests/e2e/helpers/db.ts`); withdrawn session → "Bắt đầu"; unknown id and another learner's custom topic both answer 404 with the same body; a custom topic of the owner shows the AI line; `topic_opened` has one row per signed-in visit and none for a guest.

## Success criteria

- [x] All §7 rows produce the button the table names, for a learner and for a demo account.
- [x] `tests/e2e/access-isolation.spec.ts` gains the custom-topic case and passes.
- [x] The page HTML holds no item content, tag, hook line or sample question.
- [x] Existing e2e specs that assert the prep breadcrumb or the avatar are updated, not deleted.

## Deviations and notes from the implementation

- **`topic_opened` is reported by the page from the browser**, not written while it renders: `TopicOpened` (a client effect) calls the server action `topicOpened`, which runs `reportTopicOpened`. The page asks the server for itself again once shown (`RefreshOnShow`, so a card is current after the back button), and a render-time write would have counted that as a second visit. This was reasoned from the code, not measured. The action writes only for a consenting learner and a topic that learner can see; the e2e spec checks one row per visit across a hover, the page's own refresh, a reload and a return.
- **In development React runs effects twice**, so a visit writes two rows there. Production writes one.
- **"Bắt đầu buổi mới" on a demo card is a form** posting the existing `startSession` action (FR-45: it creates the session at once). Every other card button is a link. `StartSessionButton` gained a `card` size.
- **The day in "Đã luyện · dd/mm"** is the day the session started, as in "Buổi của tôi".
- **"Bạn đã luyện k/n"** is shown to every signed-in learner, 0/n included, and counts a persona with any finished session, as the library does (so a demo account that started a new session after a finished one still reads 1/1).
- **A custom topic's page** shows "Kiểm tra nhẹ" and the AI line in place of a role label and a summary (its stored summary is the fixed text "Chủ đề tự tạo"). The FR-51 warning stays. A custom topic whose scenario is being prepared, did not pass, or was taken down shows the empty state to its owner.
- **A topic id that is not a slug** (a zero byte, upper case, over 200 characters) is "not found" before the database is asked: Postgres answers some of those with an error, not with no row.
- **The portrait needs two fields in two browser payloads:** `avatarKey` on the interview screen's persona, and `avatarKey` + `displayName` on a row of "Buổi của tôi". Both are public persona fields. A row with no persona yet shows an empty circle.
- **The page title is the fixed "Chủ đề · InterviewLab"**, like Màn 3; the artboard puts the topic's title there.
- **Strings:** 6 more product strings (`topic.*`), 19 since phase 2 began. The user task in `plan.md` covers them.
- **`node_modules/next/dist/docs/` was not read:** a hook of this machine denies the folder. The page follows the patterns already in the repo (`library`, `my-sessions`, `prep`).

## Risk assessment

- **Leak through the persona card.** `research_goal`, `tagline` and `name` are public fields already shown on Màn 3; the count is the only thing derived from items. The e2e assertion covers a regression.
- **FR-5 and the tombstone.** A learner who deleted the account and returned sees "Bắt đầu", then Màn 3 refuses with the existing `PLAYED_BEFORE_DELETION` text. Acceptable: the refusal already exists there; do not duplicate the check on the card.
- **Avatar initials for Vietnamese names.** "Chị Thu, 26 tuổi" must give "T", not "C": take the first letter of the last word of `display_name` ("chị Thu" → "T"). Unit-test with the seven personas.
