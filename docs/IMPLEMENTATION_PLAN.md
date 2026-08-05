# Implementation plan

Each phase ends with working behavior and explicit acceptance checks.

## Phase 1 — Foundation and private local data

**Deliverables**

- Mobile-first visual system and navigation
- Typed records and IndexedDB repository
- Seeded demo state only on explicit user action
- Date selection, empty states, error handling
- JSON backup, restore, and erase

**Constraints**

- No health records in D1, R2, cookies, analytics, or application logs
- No photos persisted in any browser or server store
- Schema changes remain versioned and migratable

**Success criteria**

- Records survive a reload on the same browser
- Invalid imports do not mutate existing data
- Erase removes every local record

## Phase 2 — Sleep and movement

**Deliverables**

- Sleep start/stop and manual correction
- Daily steps, active calories, exercise minutes
- Named activity entries
- Apple Health Shortcut payload import

**Constraints**

- Handle sessions spanning midnight
- Prevent negative durations and unsafe numeric values
- Upsert, rather than add, daily Health summaries

**Success criteria**

- Eight-hour cross-midnight sleep reports 8h 00m
- Editing a record immediately updates totals
- Re-importing the same Health day does not duplicate totals

## Phase 3 — Food logging and photo estimates

**Deliverables**

- Camera/photo picker and client preview
- Server-side image validation
- Structured calorie/macronutrient estimate
- Editable confirmation form and manual fallback

**Constraints**

- 8 MB maximum; explicit image MIME allowlist
- No image persistence or body logging
- API key is either a hosted secret or a separate device-local secret excluded from backups; it is never committed or stored with health records
- Estimates carry confidence and uncertainty copy

**Success criteria**

- A valid configured request returns all required fields
- Missing API configuration produces a useful manual-entry fallback
- Closing or saving removes the local preview reference

## Phase 4 — Daily debrief and heatmap

**Deliverables**

- Daily metric cards and energy context
- Deterministic natural-language debrief
- Seven-day comparisons
- Twelve-week consistency heatmap

**Constraints**

- Do not generate medical recommendations
- Do not treat calories burned as exact or encourage compensatory eating
- Missing data is described as missing, not zero behavior

**Success criteria**

- Debrief statements can be traced to visible recorded values
- Heatmap cells expose date and summary to assistive technology
- Date navigation updates every surface consistently

## Phase 5 — Verification and release

**Deliverables**

- Responsive and interaction QA
- Production build and deployed private checkpoint
- Maintainer README and current docs
- Personal GitHub repository mirror

**Constraints**

- Repository contains no API key or health records
- Deployment remains owner-only unless the owner explicitly widens access
- GitHub visibility defaults to private for this personal project

**Success criteria**

- Core flows work at iPhone width and desktop width
- Build/tests pass
- Deployed URL is verified
- GitHub default branch contains the same release source and docs
