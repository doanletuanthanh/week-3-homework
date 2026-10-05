---
title: "Phase 2: Scenario schema validate and first persona"
status: todo
phase: 2
priority: P1
effort: "2.5d"
dependencies: [1]
---

# Phase 2: Scenario schema, validate, first persona

## Overview

The scenario file format, the `validate` command that enforces FR-33, the CLI shell every later command plugs into, and the first UX persona ("chị Thu", 11 items) imported into the database.

## Context links

- PRD §4, §8.1 (item, unlock paths), FR-33, UJ-1 (chị Thu's hook and the paid-app item); addendum §2.8 (authoring rubric), §4 (`scenario` JSON).

## Requirements

- [ ] One Zod schema is the single definition of a scenario; the engine, CLI, generator (phase 9) and DB import all use it.
- [ ] `validate` reports every violation with a path and a Vietnamese-readable message, exit code 1 on any.
- [ ] Persona "chị Thu": research goal "Vì sao người trẻ bắt đầu rồi bỏ việc theo dõi chi tiêu?", ≥ 12 surface facts, 11 items covering all four paths, reviewed by the user.
- [ ] `import` writes a new draft version; published versions are immutable; `persona_id` is stable across versions.

## Architecture

Scenario JSON (`src/scenario/schema.ts`):

```
persona_id, topic_id, language: "vi", version
persona: { display_name, name, tagline, avatar_key, identity, voice_notes }
research_goal, opening_line, surface_facts[>=12]
openness_start (default 4), habit_threshold (default 2)
error_patterns: { closed, hypothetical_future, other }
habit_card_label
items[8..12]: {
  id, content, secret_terms[],        // key phrases that carry the secret
  topic_tag,                          // public, must not reveal content
  path: surface | follow_up | past_story | trust,
  prerequisite_id?, trust_threshold?, // threshold only for trust
  hook_line, do_not_assert: { id, text },
  weight, sample_question
}
```

`secret_terms` is an authoring field this plan adds so "no locked content in tag, hook line or do-not-assert" (FR-33) is a deterministic check instead of a guess. The generator in phase 9 must fill it too.

`validate` rules (`src/scenario/validate.ts`, pure):

1. Schema; 8–12 items; all four paths present; ≥ 2 items on past_story or trust; ≥ 12 surface facts; `research_goal` ends with a question mark.
2. Every item has ≥ 1 `secret_terms`, and each term occurs in that item's `content` (so a generator cannot pass the rule with empty or unrelated terms). No `secret_terms` of any item appears (case- and diacritic-insensitive token match) in any topic tag, hook line, do-not-assert text, surface fact, opening line or tagline.
3. Topic tags unique within the persona, and not used by another persona of the same topic (checked against DB when a connection is available).
4. Prerequisite graph has no cycle and every prerequisite exists.
5. Trust thresholds are within reach: `openness_start < threshold ≤ 10` and reachable in ≤ 20 good turns.
6. No text addressed to the model in **any** string field (persona, surface facts, opening line, hook lines, item content, do-not-assert, research goal): role markers, "system/prompt/instruction" vocabulary, second-person commands to an assistant. The rule is a cheap first filter; ordinary Vietnamese words such as "hãy" alone do not trip it. The real guard for generated scenarios is data-wrapping in prompts (phase 3) plus the safety call (phase 9).

CLI: `cli/index.ts` with subcommands, run as `pnpm il <command>`. Every command that reads learner data writes `admin_access_log` (table added in phase 3 with `trace`).

## Related code files

- Create: `src/scenario/schema.ts`, `src/scenario/validate.ts`, `src/scenario/text-normalize.ts`, `src/db/repo/scenarios.ts`, `cli/index.ts`, `cli/commands/validate.ts`, `cli/commands/import-scenario.ts`, `scenarios/ux-chi-tieu/topic.json`, `scenarios/ux-chi-tieu/chi-thu.json`, `src/components/persona-avatar.tsx`, `tests/scenario/validate.test.ts`
- Modify: `src/db/schema.ts` (scenario columns per addendum §4), `package.json` (`il` script, `tsx`)

## Implementation steps

1. Write the Zod schema and inferred types.
2. Write `validate` as a list of small rule functions returning `{path, code, message}`; unit-test each rule with a passing and a failing fixture.
3. Write the CLI shell and `validate <file>`.
4. Draft chị Thu: 11 items. Fixed from the PRD: the follow-up item behind the hook "có lần chị định ghi lại nhưng rồi cũng bỏ" is "đang trả phí cho một app gần như không mở". The rest follow the rubric: a side aspect of the topic, ≥ 2 items a novice would not guess, surface facts rich enough for 30 turns.
5. Run `validate` until clean; show the persona file to the user for review before import.
6. Write `import <file>`: upsert topic, insert scenario as a new draft version; refuse to overwrite a published version.
7. Replace the phase 1 seed row with the imported scenario; Màn 3 shows the real seal counter ("Đang giữ 11 điều chưa nói").

## Todo

- [ ] Schema and types
- [ ] Validate rules + tests
- [ ] CLI shell, `validate`, `import`
- [ ] Chị Thu drafted, validated, user-reviewed, imported

## Success criteria

- [ ] `pnpm il validate scenarios/ux-chi-tieu/chi-thu.json` exits 0.
- [ ] Each FR-33 rule has a failing fixture that produces exactly its error code.
- [ ] Importing twice creates version 2 and leaves version 1 untouched.

## Risk assessment

- **Persona content is product quality, not code.** A flat persona makes the whole loop dull. Mitigation: user review in step 5; tuning continues in phase 4 against eval results.
- **`secret_terms` matching is lexical**, so a paraphrase in a hook line can still hint at content. Mitigation: the leak judge in phase 4 covers meaning; this rule only catches the obvious cases.
