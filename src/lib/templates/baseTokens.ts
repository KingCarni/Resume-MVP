export type TemplateCategory =
  | "ats-safe"
  | "professional"
  | "editorial"
  | "technical"
  | "creative";

export type ColorSchemeCategory =
  | "professional"
  | "warm"
  | "soft"
  | "bold"
  | "dark";

export type ResumeLayoutId =
  | "modern"
  | "classic"
  | "minimal"
  | "executive"
  | "compact"
  | "sidebar"
  | "serif"
  | "ats"
  | "sidebar-right"
  | "grid-blueprint"
  | "profile-panel"
  | "timeline"
  | "corporate-polished"
  | "technical-grid";

export type TemplateCapabilityFlags = {
  supportsPhoto: boolean;
  supportsSidebar: boolean;
  supportsCards: boolean;
  usesHeaderBar: boolean;
  usesChips: boolean;
  atsSafetyTier: "high" | "medium" | "low";
};

export type ThemeArgs = {
  font: "sans" | "serif" | "mono";
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2?: string;
  bodyBg: string;
  pageBg: string;
  headerBg: string;
  cardBg: string;
  radius: number;
  shadow: string;
  borderStyle?: "solid" | "dashed";
  headerAfterGrid?: boolean;
  hasChips?: boolean;
};

export type ResumeLayoutDefinition = {
  id: ResumeLayoutId;
  label: string;
  category: TemplateCategory;
  capabilities: TemplateCapabilityFlags;
};

export const RESUME_LAYOUTS: Record<ResumeLayoutId, ResumeLayoutDefinition> = {
  modern: {
    id: "modern",
    label: "Modern Clean",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: true,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  classic: {
    id: "classic",
    label: "Classic Professional",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: false,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "high",
    },
  },
  minimal: {
    id: "minimal",
    label: "Minimal Lite",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  executive: {
    id: "executive",
    label: "Executive Premium",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  compact: {
    id: "compact",
    label: "Compact Dense",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: false,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "high",
    },
  },
  sidebar: {
    id: "sidebar",
    label: "Sidebar Left",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: true,
      supportsCards: true,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  serif: {
    id: "serif",
    label: "Serif Editorial",
    category: "editorial",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: true,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  ats: {
    id: "ats",
    label: "ATS Plain",
    category: "ats-safe",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: false,
      usesHeaderBar: false,
      usesChips: false,
      atsSafetyTier: "high",
    },
  },
  "sidebar-right": {
    id: "sidebar-right",
    label: "Sidebar Right",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: true,
      supportsCards: true,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  "grid-blueprint": {
    id: "grid-blueprint",
    label: "Grid Blueprint",
    category: "technical",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: true,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  "profile-panel": {
    id: "profile-panel",
    label: "Profile Panel",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: true,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  timeline: {
    id: "timeline",
    label: "Timeline Professional",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: false,
      usesHeaderBar: false,
      usesChips: true,
      atsSafetyTier: "high",
    },
  },
  "corporate-polished": {
    id: "corporate-polished",
    label: "Corporate Polished",
    category: "professional",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: true,
      usesChips: true,
      atsSafetyTier: "medium",
    },
  },
  "technical-grid": {
    id: "technical-grid",
    label: "Technical Grid",
    category: "technical",
    capabilities: {
      supportsPhoto: true,
      supportsSidebar: false,
      supportsCards: true,
      usesHeaderBar: true,
      usesChips: false,
      atsSafetyTier: "high",
    },
  },
};

export const DEFAULT_RESUME_LAYOUT_ID: ResumeLayoutId = "modern";
