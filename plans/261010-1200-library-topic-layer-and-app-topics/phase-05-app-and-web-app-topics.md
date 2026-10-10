---
title: "Phase 5: App and web app topics"
status: todo
phase: 5
priority: P1
effort: "4.5d"
dependencies: [1]
---

# Phase 5: App and web app topics

## Overview

Three curated topics for learners who are building an app or a web app, two personas each: six scenario files that pass `validate` and are imported as drafts. Content work; no application code.

## Context links

- PRD §4 (topic and persona model, anti-anchoring rules), FR-33, FR-36, addendum §2.8 (authoring rubric).
- Template and rules: `scenarios/ux-chi-tieu/chi-thu.json`, `src/scenario/schema.ts`, `src/scenario/validate.ts`.
- Lessons from chị Thu (bootstrap plan, phase 4 notes and open question 7): a good simulated run opened 36 % of the items against the 50–75 % target, and the persona invented detail beyond its facts.

## Requirements

- Functional:
  - Each topic folder has `topic.json` (`id`, `title`, `summary`, `role: "ux"`, `display_order`: all five required, the import refuses a file without one) and two persona files.
  - Each persona: `research_goal` written as a question about a side process of the topic, not its most obvious question; `opening_line`; ≥ 12 surface facts; 8–12 items covering all four paths (`surface`, `follow_up`, `past_story`, `trust`) with ≥ 2 on `past_story` or `trust`; every item with `secret_terms`, `topic_tag`, `hook_line`, `do_not_assert`, `sample_question`.
  - The two personas of a topic share no `topic_tag` and their items are different stories, so the second session is not a repeat of the first.
  - No real person, company, brand or product name anywhere. Everything is fiction and reads as one person's experience, never as a claim about users in general.
  - No hook line, tag or public field contains a secret term of a locked item; no sample question is leading (`pnpm il check-strings` / FR-36 check).
- Non-functional:
  - Vietnamese, in the persona's own voice; `voice_notes` say how they talk.
  - A persona is a user or stakeholder of the app idea, never a developer explaining technology: the learner practises interviewing, not system design.

## Proposed topics and personas

Confirmed by the user 2026-10-10; the content of each persona is still reviewed in step 7. `display_order`: `ux-chi-tieu` 10, then 20, 30, 40.

| Topic id | Title | Summary | Persona | Research question | Where the unsaid items sit |
|---|---|---|---|---|---|
| `ux-cong-viec-nhom` | Web app quản lý công việc cho nhóm nhỏ | Một nhóm vài người giao việc, nhắc việc và biết việc tới đâu bằng cách nào. | chị Hạnh, 31, trưởng nhóm thiết kế 6 người ở một agency nhỏ | Trưởng nhóm biết một việc đang kẹt bằng cách nào, khi không ai báo? | giao việc qua chat rồi tự chép vào sổ riêng; từng trả tiền một công cụ cả nhóm bỏ sau hai tuần; ngại hỏi tiến độ người lớn tuổi hơn |
| | | | anh Khoa, 27, lập trình viên tự do làm cùng lúc ba khách | Người làm tự do theo dõi yêu cầu sửa đổi của khách ra sao sau khi đã chốt việc? | cập nhật hai nơi cho hai khách; yêu cầu sửa qua tin nhắn thoại không ghi lại được; một lần làm không công vì không có bằng chứng |
| `ux-dat-san-the-thao` | Ứng dụng đặt sân thể thao theo giờ | Người chơi và chủ sân giữ chỗ, đổi giờ và chia tiền sân ra sao. | anh Tùng, 34, người đứng ra gom nhóm cầu lông hằng tuần | Người tổ chức một nhóm chơi cố định lo chuyện vắng người và tiền sân như thế nào? | giữ sân nhờ quen chủ sân, không qua kênh nào; ứng tiền trước và ngại đòi; danh sách chờ trong đầu |
| | | | cô Lan, 52, chủ một cụm bốn sân nhỏ | Chủ sân nhỏ xử lý khách quen và khách đặt rồi không tới ra sao? | sổ giấy là bản chính, bảng tính con gái làm là bản phụ; ưu tiên khách quen trái với lịch đã nhận; từng thử một phần mềm và mất khách vì đặt cọc |
| `ux-ban-hang-online` | Web app bán hàng cho cửa hàng online nhỏ | Một cửa hàng vài người nhận đơn, đóng gói và đối soát tiền như thế nào. | chị My, 29, bán đồ thủ công qua mạng xã hội | Người bán nhỏ biết đơn nào đã chốt thật, khi mọi thứ nằm trong tin nhắn? | chốt đơn bằng ảnh chụp màn hình; giá khác nhau cho khách quen không ghi ở đâu; bỏ một công cụ bán hàng vì khách không chịu điền form |
| | | | bạn Phúc, 22, làm thêm đóng gói và đối soát đơn thu hộ | Người đóng gói phát hiện và sửa một đơn sai trước khi nó đi như thế nào? | tự đặt quy ước đánh dấu riêng trên bao bì; lệch tiền thu hộ tự bù rồi mới báo; không dám nói chủ shop nhập sai tồn |

Role `ux` for all six: BA and PM personas need the grounding pack of FR-65, which this plan does not build.

## Architecture

- Files: `scenarios/<topic-id>/topic.json`, `scenarios/<topic-id>/<persona-id>.json` (`persona_id` = `chi-hanh`, `anh-khoa`, `anh-tung`, `co-lan`, `chi-my`, `ban-phuc`; check none collides with an existing id).
- Per persona, the same loop the bootstrap plan used for chị Thu: draft → `pnpm il validate <file>` until clean → `pnpm il check-strings` check → `pnpm il import <file>` on the local database → one hand-played session → one quick evaluation run (good/bad ×1) → adjust → re-validate.
- To address the two chị Thu lessons while writing: give each `follow_up` and `past_story` item a hook that a careful listener would plausibly pick up within 20 good turns (not three chained prerequisites), and put every concrete detail the persona may mention into `surface_facts`, so the model has less to invent.
- Optional starting point: the custom-topic generator (`src/graphs/generation-graph.ts`) can draft a scenario from a topic line. If used, treat its output as a first draft only; a person rewrites items and hooks, and `origin` stays `authored` because the file goes through `import`.

## Related code files

- Create: `scenarios/ux-cong-viec-nhom/{topic.json,chi-hanh.json,anh-khoa.json}`, `scenarios/ux-dat-san-the-thao/{topic.json,anh-tung.json,co-lan.json}`, `scenarios/ux-ban-hang-online/{topic.json,chi-my.json,ban-phuc.json}`
- Create: `tests/scenario/curated-scenarios.test.ts` — loads every file under `scenarios/`, runs `validateScenario` with the other personas of its topic as context, expects no violation. (If a test already does this for chị Thu, extend it to walk the folder.)
- Modify: `tests/helpers/test-db.ts` (it seeds from the constant `PERSONA_FILE = "scenarios/ux-chi-tieu/chi-thu.json"`, verified) so the test databases can import every scenario folder. Keep the one-persona seed as the default for the existing specs and add an opt-in for the library specs, so no existing test changes meaning.

## Order of writing

First one persona per topic (chị Hạnh, anh Tùng, chị My), through validate, import, the hand-played session and user review. Then the second three. If the plan runs late, the first three ship with the screens and the second three follow (user decision 2026-10-10); the launch checklist then says which topics have one persona.
<!-- Updated: Validation Session 1 - topics confirmed; write order and late fallback; seed file corrected -->

## Implementation steps

1. Write the three `topic.json` files.
2. Follow "Order of writing": steps 3–7 for the first three personas, then again for the second three.
3. Per persona (≈ 0.7 day each): identity, voice, surface facts; the 8–12 items with paths and prerequisites; hooks, tags, sample questions, `do_not_assert`; error patterns and habit label.
4. `validate` and the string check until clean, each file alone and then the pair (tag rule).
5. Import locally; play one session per persona by hand; fix what reads false.
6. Ask the user before spending on LLM runs, then one quick evaluation per persona (`pnpm il eval <persona> --profile quick`); record opened-item share and any leak flag in this file under "Results".
7. User reads the six files. Their edits go through steps 4–5 again.
8. The folder-walking test and the e2e seeding change.

## Success criteria

- [ ] Six files pass `pnpm il validate` with zero violations, with their topic sibling as context.
- [ ] `pnpm il import` stores six drafts and three topics with role `ux` on a clean local database.
- [ ] One hand-played session per persona reaches the reveal with at least one item told and no item spoken before its unlock (checked with `pnpm il trace <session>`).
- [ ] The user has approved the content, recorded here with the date.
- [ ] `tests/scenario/curated-scenarios.test.ts` passes in `pnpm test`.

## Risk assessment

- **Unevaluated personas reach learners.** They are drafts with no full evaluation and no leak adjudication, exactly as chị Thu is today; launch gate 2 stays open for seven personas instead of one. Mitigation: the hand-played session and one quick run each; the gate itself is unchanged and reports on `publish`.
- **Anchoring.** These topics are what learners build for their own projects, which is the reason for adding them and also the case FR-51 warns about. The warning on Màn 2b and Màn 3 is the control; each research question is about a side process on purpose. Do not soften that when rewording.
- **Cost of tuning.** Quick runs only; a full run is 20–40 USD per persona and is out of scope.
- **Effort.** Six personas at 0.7 day is the largest block of the plan and the least predictable. The fallback is decided: see "Order of writing".
