src/components/ResumeMvp/index.tsx

CHANGE 1 — add a reusable saved-resume hydrator
Replace the existing applyStructuredSnapshot block and the following hydrateLatestResume useEffect area with this version.

const applyStructuredSnapshot = useCallback((snapshot: StructuredResumeSnapshot | null | undefined) => {
  const next = sanitizeStructuredResumeSnapshot(snapshot);
  if (!next) return false;

  setTargetPosition(next.targetPosition || "");
  if (TEMPLATE_OPTIONS.some((option) => option.id === next.template)) {
    setResumeTemplate(next.template as ResumeTemplateId);
  }
  setProfile({
    fullName: next.profile.fullName,
    titleLine: next.profile.titleLine,
    locationLine: next.profile.locationLine,
    email: next.profile.email,
    phone: next.profile.phone,
    linkedin: next.profile.linkedin,
    portfolio: next.profile.portfolio,
    summary: next.profile.summary,
  });

  const nextSections = next.sections.length
    ? next.sections
    : [{ id: "default", company: "Experience", title: "", dates: "", location: "", bullets: [] }];

  setSections(nextSections.map(({ bullets: _bullets, ...section }) => section));
  setEditorBulletsBySection(
    nextSections.reduce<Record<string, string[]>>((acc, section) => {
      acc[section.id] = Array.isArray(section.bullets)
        ? section.bullets.map((bullet) => String(bullet ?? ""))
        : [];
      return acc;
    }, {})
  );
  setEditorEducationItems(next.educationItems);
  setEditorExpertiseItems(next.expertiseItems);
  setEditorMetaGames(next.metaGames);
  setEditorMetaMetrics(next.metaMetrics);
  setShippedLabelMode(next.shippedLabelMode === "apps" ? "Apps" : "Games");
  setIncludeMetaInResumeDoc(next.includeMetaInResumeDoc);
  setShowShippedBlock(next.showShippedBlock);
  setShowMetricsBlock(next.showMetricsBlock);
  setShowEducationOnResume(next.showEducationOnResume);
  setShowExpertiseOnResume(next.showExpertiseOnResume);
  setShowProfilePhoto(next.showProfilePhoto);
  setProfilePhotoDataUrl(next.profilePhotoDataUrl);
  setProfilePhotoShape(next.profilePhotoShape);
  setProfilePhotoSize(next.profilePhotoSize);

  return true;
}, []);

const hydrateLatestSavedResume = useCallback(
  async (options?: { force?: boolean }) => {
    if (status !== "authenticated") return null;
    if (!options?.force && latestResumeHydratedRef.current) return null;

    try {
      const response = await fetch("/api/resume-latest", { method: "GET", cache: "no-store" });
      const payload = (await parseApiResponse(response)) as LatestResumePayload | string;

      if (!response.ok || typeof payload === "string" || !payload?.ok || !payload.item) return null;

      const latest = payload.item;
      const nextText = String(latest.text || "").trim();
      const structuredApplied = applyStructuredSnapshot(latest.structuredData || null);

      if (!nextText && !structuredApplied) return null;

      latestResumeHydratedRef.current = true;

      if (nextText) {
        setResumeText(nextText);
      }

      if (latest.template && TEMPLATE_OPTIONS.some((option) => option.id === latest.template)) {
        setResumeTemplate(latest.template as ResumeTemplateId);
      }

      setResumeSourceMeta({
        fileName: latest.sourceFileName || null,
        mimeType: latest.sourceMimeType || null,
        extension: latest.sourceFileExtension || null,
        sourceKind: latest.sourceKind || "saved_resume",
      });

      setLatestResumeMeta({
        title: String(latest.title || latest.sourceFileName || "Latest saved resume"),
        createdAt: latest.createdAt,
      });

      const structuredText = structuredApplied && latest.structuredData
        ? structuredSnapshotToResumeText(latest.structuredData)
        : "";

      const htmlText = String(latest.html || "").trim()
        ? htmlToPlainText(String(latest.html || ""))
        : "";

      return {
        text: nextText,
        structuredText,
        htmlText,
      };
    } catch {
      return null;
    }
  },
  [status, applyStructuredSnapshot]
);

useEffect(() => {
  if (status !== "authenticated" || latestResumeHydratedRef.current) return;
  if (file || resumeText.trim() || analysis) return;

  let cancelled = false;

  async function hydrateLatestResume() {
    const hydrated = await hydrateLatestSavedResume();
    if (!hydrated || cancelled) return;
  }

  void hydrateLatestResume();

  return () => {
    cancelled = true;
  };
}, [status, file, resumeText, analysis, hydrateLatestSavedResume]);



CHANGE 2 — fix analyze so saved FTUE resume is loaded before analyze
Inside handleAnalyze(), replace the top part of the try block down through effectiveTargetPosition / effectiveJobText setup with this:

    try {
      let res: Response;

      let structuredSnapshotText = hasStructuredResumeBullets(structuredResumeSnapshot)
        ? structuredSnapshotToResumeText(structuredResumeSnapshot)
        : "";
      let htmlDraftPlain = liveResumeHtml.trim() ? htmlToPlainText(liveResumeHtml) : "";
      let resumeInput = file
        ? resumeText.trim()
        : structuredSnapshotText || htmlDraftPlain || resumeText.trim();

      if (!file && !String(resumeInput).trim()) {
        const hydrated = await hydrateLatestSavedResume({ force: true });
        if (hydrated) {
          structuredSnapshotText = hydrated.structuredText || structuredSnapshotText;
          htmlDraftPlain = hydrated.htmlText || htmlDraftPlain;
          resumeInput =
            hydrated.structuredText ||
            hydrated.htmlText ||
            hydrated.text ||
            resumeInput;
        }
      }

      const resumePlain = looksLikeHtmlInput(resumeInput) ? htmlToPlainText(resumeInput) : resumeInput;
      const resumeTextForApi = resumePlain ? normalizeResumeTextForParsing(resumePlain) : "";

      if (!file && !resumeTextForApi.trim()) {
        throw new Error("No saved resume was loaded. Open your saved FTUE resume first or upload a file.");
      }

      const effectiveTargetPosition = isSetupMode ? "Professional Resume" : targetPosition.trim();

      const analyticsParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const analyticsJobId =
        analyticsParams?.get("jobId") || String(applyPackBundle?.jobId || "").trim();
      const analyticsResumeProfileId =
        analyticsParams?.get("resumeProfileId") || String(applyPackBundle?.resumeProfileId || "").trim();
      const analyticsBundle =
        analyticsParams?.get("bundle") || String(applyPackBundle?.bundle || "").trim();
      const analyticsMode = analyticsBundle === "apply-pack" ? "apply_pack" : "resume";
      const effectiveJobText = isSetupMode ? setupModeJobText : jobText;



CHANGE 3 — FTUE button should go to Jobs instead of cover letter
Add this near the existing continueToCoverLetter callback:

  const finishSetupAndGoToJobs = useCallback(async () => {
    const syncedProfileId = await syncResumeProfileDraft();
    if (syncedProfileId) {
      router.push("/jobs");
      return;
    }

    if (!profileSyncDirty && analysis) {
      router.push("/jobs");
    }
  }, [syncResumeProfileDraft, router, profileSyncDirty, analysis]);



CHANGE 4 — remove the self-reference crash
In the structuredResumeSnapshot useMemo dependency array, delete:
  structuredResumeSnapshot

The dependency array should be:

  }), [
    targetPosition,
    resumeTemplate,
    profile,
    sections,
    editorBulletsBySection,
    editorEducationItems,
    editorExpertiseItems,
    editorMetaGames,
    editorMetaMetrics,
    shippedLabelMode,
    includeMetaInResumeDoc,
    showShippedBlock,
    showMetricsBlock,
    showEducationOnResume,
    showExpertiseOnResume,
    showProfilePhoto,
    profilePhotoDataUrl,
    profilePhotoShape,
    profilePhotoSize,
  ]);



CHANGE 5 — swap the FTUE top CTA
Replace the current second button inside the “Resume workflow guide” action row:

              <button
                type="button"
                onClick={continueToCoverLetter}
                disabled={!canContinueToCoverLetter}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black shadow-md transition-all duration-200 hover:bg-emerald-700 disabled:opacity-50"
              >
                Continue to Cover Letter
              </button>

with this:

              {isSetupMode ? (
                <button
                  type="button"
                  onClick={finishSetupAndGoToJobs}
                  disabled={!analysis || profileSyncSaving}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black shadow-md transition-all duration-200 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {profileSyncSaving ? "Finishing setup…" : "Finish Setup & Go to Job Board"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={continueToCoverLetter}
                  disabled={!canContinueToCoverLetter}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black shadow-md transition-all duration-200 hover:bg-emerald-700 disabled:opacity-50"
                >
                  Continue to Cover Letter
                </button>
              )}



CHANGE 6 — optional cleanup
There is also a shipped-label casing mismatch already in this file.
This line should stay as:
  const [shippedLabelMode, setShippedLabelMode] = useState<"Games" | "Apps">("Games");

And inside applyStructuredSnapshot it should set:
  setShippedLabelMode(next.shippedLabelMode === "apps" ? "Apps" : "Games");

That avoids the lowercase/uppercase drift.

Expected behavior after these changes:
1. FTUE users finish setup and get sent to /jobs instead of cover-letter.
2. Standard resume analyze can recover the saved FTUE resume when no new file is loaded.
3. The structuredResumeSnapshot runtime crash is removed.
