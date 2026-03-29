# ATS weighting approach for Git-a-Job

## Recommended scoring shape
Use weighted evidence, not raw keyword volume.

### 1) Title and title-alias match
- Exact target title in headline or most recent experience: strongest boost
- Close alias match: strong boost
- Same family but wrong title: smaller boost

### 2) Category weighting
Use the category weights from each role object.

High-signal buckets:
- `coreTitles`
- `gameSignals`
- `toolsAndTech`
- `outcomes`

Medium-signal buckets:
- `altTitles`
- `enginesPlatforms`
- `methodologies`
- `deliverables`

Low-signal bucket:
- `softSignals`

### 3) Placement boost
Boost terms based on where they appear:
- Headline / target title
- Summary
- Most recent experience
- Skills
- Projects
- Older experience

### 4) Evidence boost
Add extra weight when a keyword is near:
- a metric (`%`, numbers, time reduction, revenue, retention, etc.)
- an action verb (`built`, `led`, `shipped`, `optimized`, `implemented`, `owned`)
- a shipped-title / live-ops / launch signal
- a concrete deliverable

### 5) Penalties
Apply penalties for:
- keyword stuffing
- title mismatch with weak support
- profiles that list only soft skills
- roles with generic terms but no game-industry signals

## Fast heuristic
A good first version is:

`final_score = title_score + weighted_keyword_score + evidence_boosts - penalties`

Then normalize to 0-100.

## Important implementation note
Do not let common generic words dominate:
- collaboration
- communication
- agile
- documentation

These should help only after a role family is already clear.
