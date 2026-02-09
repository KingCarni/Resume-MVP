"use client";

import { useMemo, useState } from "react";

type VerbStrength = {
  score: number;
  label: "Weak" | "OK" | "Strong";
  detectedVerb?: string;
  suggestion?: string;
  baseScore?: number;
  rewriteBonusApplied?: number;
};

type RewritePlanItem = {
  originalBullet?: any;
  suggestedKeywords?: any;
  rewrittenBullet?: any;

  needsMoreInfo?: boolean;
  notes?: string[];
  keywordHits?: string[];
  blockedKeywords?: string[];

  verbStrength?: VerbStrength; // BEFORE (from analyze)

  // ✅ NEW: server-provided mapping from bullet -> job section
  jobId?: string;
};

type ResumeTemplateId = "classic" | "modern" | "minimal";

type ResumeProfile = {
  fullName: string;
  titleLine: string;
  locationLine: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  summary: string;
};
