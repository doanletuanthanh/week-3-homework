---
phase: 1
title: "Brand icon from the logo mark"
status: completed
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 1: Brand icon from the logo mark

## Overview

Fix F1 ("chưa đồng bộ icon"). The tab shows Next's default ▲ while the header shows the green InterviewLab mark. Generate the tab and home-screen icons from the same glyph the header draws, so they cannot drift again.

## Context

- `src/app/favicon.ico`: 25 931 bytes, the create-next-app default. No `public/`, no `icon.*`, no `apple-icon.*`.
- The mark: `src/components/site-header.tsx` `Logo()`: 3 SVG paths in `.logo-mark` (32×32, radius 8, background `--primary-container` `#0d593f`, white glyph; `src/app/globals.css:56`).
- Next 16 file conventions (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`): `icon.tsx` / `apple-icon.tsx` default-export an `ImageResponse` (`next/og`); generated at build time unless they use request APIs. Link: `<link rel="icon" href="/icon?<hash>">`.
- `src/proxy.ts:43` matcher skips `favicon.ico` and image extensions. `/icon` and `/apple-icon` have no extension, so each icon request would run the Supabase session refresh.
- CSP `img-src 'self' data:` (`src/server/content-security-policy.ts:33`): allows them.

## Requirements

- Functional: every page links a PNG icon and an apple-touch icon drawn from the header glyph; `/favicon.ico` serves the brand icon, not ▲.
- Non-functional: one source for the glyph; no runtime cost (static at build); no proxy work for icon requests.

## Architecture

```
src/components/brand-mark.tsx  ── BrandGlyph (3 paths), BRAND_TILE = "#0d593f"
      ├── site-header.tsx Logo()  (inside .logo-mark, unchanged look)
      ├── src/app/icon.tsx         ImageResponse 32×32 PNG, rounded tile + white glyph
      └── src/app/apple-icon.tsx   ImageResponse 180×180 PNG, square tile (iOS rounds it)
next.config.ts rewrites: /favicon.ico → /icon
```

`BRAND_TILE` duplicates the CSS token because `ImageResponse` cannot read CSS variables; a comment names `--primary-container` as the source.

## Related Code Files

- Create: `src/components/brand-mark.tsx`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`
- Modify: `src/components/site-header.tsx` (Logo uses `BrandGlyph`), `src/proxy.ts` (matcher skips `icon$|apple-icon$`), `next.config.ts` (rewrite)
- Delete: `src/app/favicon.ico`
- Test: `tests/e2e/startup.spec.ts` (or `hardening.spec.ts`, whichever already checks headers on a production build)

## Implementation Steps

1. Move the three `<path>`s of `Logo()` into `BrandGlyph({ size, color })` in `brand-mark.tsx`; `Logo()` renders it. Visual diff of the header: none.
2. `icon.tsx`: `export const size = { width: 32, height: 32 }; export const contentType = "image/png";` default export returns `new ImageResponse(<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: BRAND_TILE, borderRadius: 7 }}><BrandGlyph size={20} color="#fff" /></div>, size)`.
3. `apple-icon.tsx`: same at 180×180, no radius, glyph ~112.
4. Delete `src/app/favicon.ico`. Add to `next.config.ts`: `rewrites: async () => [{ source: "/favicon.ico", destination: "/icon" }]` so old clients and direct hits get the brand PNG instead of a rendered 404 page.
5. `src/proxy.ts` matcher: add `icon$|apple-icon$` to the negative lookahead.
6. `pnpm build`, open `/icon` and `/apple-icon`; if Satori draws the stroked glyph wrong, fall back to a static `src/app/icon.svg` (proxy already skips `.svg`) and keep `apple-icon.tsx`.
7. e2e on the production build: `/` has `link[rel="icon"]` whose href starts with `/icon` and `link[rel="apple-touch-icon"]`; both answer 200 `image/png`; `/favicon.ico` answers 200 `image/png`.

## Todo

- [x] `BrandGlyph` extracted, header unchanged
- [x] `icon.tsx`, `apple-icon.tsx`
- [x] `favicon.ico` deleted, rewrite added
- [x] Proxy matcher skips icon routes
- [x] e2e icon checks

## Success Criteria

- [ ] Chrome tab on prod shows the green mark (screenshot like the reviewer's p.1; hard-reload, browsers cache favicons)
- [x] e2e icon checks green; `pnpm build` green

## Risk Assessment

- Favicon cache: the reviewer may still see ▲ until a hard reload or a new tab; say so when asking them to re-check.
- Satori's SVG support (stroke joins): checked in step 6 with a fallback.
- Rewrite to a metadata route: if `/icon` carries a hash-only URL in this Next version, point the rewrite at the emitted path read from the `<link>` in step 7.

## Security Considerations

None new: static images, same-origin, CSP unchanged.
