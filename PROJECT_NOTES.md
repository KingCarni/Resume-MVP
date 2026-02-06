# Resume App – MVP Build Notes

## MVP Definition
Paste resume + job posting → analyze fit → rewrite resume bullets.

## Stack
- Next.js (TypeScript, App Router)
- API routes (temporary stub)
- Windows dev environment

## Current Status
- Frontend UI working
- /api/analyze stub responding
- End-to-end submission successful

## Next Step
- Implement keyword extraction + match scoring


2026-02-06
- Implemented deterministic keyword extraction (no AI)
- Job → resume keyword match scoring
- UI renders match score, found keywords, high-impact missing
- Cleared stale results on re-submit
