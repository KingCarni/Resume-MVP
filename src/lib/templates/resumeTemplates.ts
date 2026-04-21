import {
  DEFAULT_RESUME_LAYOUT_ID,
  RESUME_LAYOUTS,
  type ResumeLayoutDefinition,
  type ResumeLayoutId,
  type TemplateCategory,
} from "./baseTokens";
import {
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME_ID,
  type ColorSchemeCategory,
  type ColorSchemeDefinition,
  type ColorSchemeId,
} from "./colorSchemes";

export type LegacyResumeTemplateId = keyof typeof LEGACY_TEMPLATE_CONFIG;

export type LegacyResumeTemplateOption = {
  id: LegacyResumeTemplateId;
  label: string;
};

export type TemplateMigrationReason = "exact" | "alias" | "fallback";

export type TemplateMigrationInfo = {
  input: string | null;
  normalizedInput: string | null;
  resolvedLegacyId: LegacyResumeTemplateId;
  reason: TemplateMigrationReason;
  matchedFrom: string | null;
};

export type LegacyResumeTemplateSelection = {
  legacyId: LegacyResumeTemplateId;
  label: string;
  layoutId: ResumeLayoutId;
  colorSchemeId: ColorSchemeId;
  layout: ResumeLayoutDefinition;
  colorScheme: ColorSchemeDefinition;
  migration: TemplateMigrationInfo;
};

type LegacyTemplateConfig = {
  label: string;
  layoutId: ResumeLayoutId;
  colorSchemeId: ColorSchemeId;
};

const LEGACY_TEMPLATE_CONFIG = {
  modern: { label: "Modern (clean)", layoutId: "modern", colorSchemeId: "modern" },
  classic: { label: "Classic (standard)", layoutId: "classic", colorSchemeId: "classic" },
  minimal: { label: "Minimal (serif-lite)", layoutId: "minimal", colorSchemeId: "minimal" },
  executive: { label: "Executive (premium)", layoutId: "executive", colorSchemeId: "executive" },
  compact: { label: "Compact (dense)", layoutId: "compact", colorSchemeId: "classic" },
  sidebar: { label: "Sidebar (2-column)", layoutId: "sidebar", colorSchemeId: "modern" },
  sidebarright: { label: "Sidebar Right", layoutId: "sidebar-right", colorSchemeId: "modern" },
  gridblueprint: { label: "Grid Blueprint", layoutId: "grid-blueprint", colorSchemeId: "blueprint" },
  profilepanel: { label: "Profile Panel", layoutId: "profile-panel", colorSchemeId: "minimal" },
  timelineprofessional: { label: "Timeline Professional", layoutId: "timeline", colorSchemeId: "classic" },
  corporatepolishedlayout: { label: "Corporate Polished", layoutId: "corporate-polished", colorSchemeId: "corporate" },
  technicalgridlayout: { label: "Technical Grid", layoutId: "technical-grid", colorSchemeId: "terminal" },
  serif: { label: "Serif (traditional)", layoutId: "serif", colorSchemeId: "serif" },
  ats: { label: "ATS (plain)", layoutId: "ats", colorSchemeId: "ats" },
  arcade: { label: "Arcade (fun)", layoutId: "modern", colorSchemeId: "arcade" },
  neon: { label: "Neon (cyber)", layoutId: "modern", colorSchemeId: "neon" },
  terminal: { label: "Terminal (dev)", layoutId: "modern", colorSchemeId: "terminal" },
  blueprint: { label: "Blueprint (tech)", layoutId: "modern", colorSchemeId: "blueprint" },
  monochrome: { label: "Monochrome (sleek)", layoutId: "modern", colorSchemeId: "monochrome" },
  noir: { label: "Noir (moody)", layoutId: "modern", colorSchemeId: "noir" },
  paper: { label: "Paper (warm serif)", layoutId: "serif", colorSchemeId: "paper" },
  ink: { label: "Ink (dashed editorial)", layoutId: "serif", colorSchemeId: "ink" },
  corporate: { label: "Corporate (polished)", layoutId: "modern", colorSchemeId: "corporate" },
  contrast: { label: "High Contrast (bold)", layoutId: "modern", colorSchemeId: "contrast" },
  minimalist: { label: "Minimalist (soft)", layoutId: "minimal", colorSchemeId: "minimalist" },
  grid: { label: "Grid (blueprint+)", layoutId: "modern", colorSchemeId: "grid" },
  retro: { label: "Retro (sunburst)", layoutId: "modern", colorSchemeId: "retro" },
  pastel: { label: "Pastel (gentle)", layoutId: "modern", colorSchemeId: "pastel" },
  aura: { label: "Aura (teal/green)", layoutId: "modern", colorSchemeId: "aura" },
  lavender: { label: "Lavender (calm)", layoutId: "modern", colorSchemeId: "lavender" },
  sunset: { label: "Sunset (pink/orange)", layoutId: "modern", colorSchemeId: "sunset" },
  forest: { label: "Forest (green)", layoutId: "modern", colorSchemeId: "forest" },
  ocean: { label: "Ocean (blue)", layoutId: "modern", colorSchemeId: "ocean" },
  sand: { label: "Sand (golden)", layoutId: "modern", colorSchemeId: "sand" },
  royal: { label: "Royal (blue/purple)", layoutId: "modern", colorSchemeId: "royal" },
  gold: { label: "Gold (premium)", layoutId: "executive", colorSchemeId: "gold" },
  bubblegum: { label: "Bubblegum (pink pop)", layoutId: "modern", colorSchemeId: "bubblegum" },
  limepop: { label: "Lime Pop (bright green)", layoutId: "modern", colorSchemeId: "limepop" },
  citrus: { label: "Citrus (orange/lemon)", layoutId: "modern", colorSchemeId: "citrus" },
  electric: { label: "Electric (cyan/purple)", layoutId: "modern", colorSchemeId: "electric" },
  confetti: { label: "Confetti (party)", layoutId: "modern", colorSchemeId: "confetti" },
  rainbow: { label: "Rainbow (bold)", layoutId: "modern", colorSchemeId: "rainbow" },
  sunny: { label: "Sunny (yellow)", layoutId: "modern", colorSchemeId: "sunny" },
  watermelon: { label: "Watermelon (pink/green)", layoutId: "modern", colorSchemeId: "watermelon" },
  grape: { label: "Grape (purple)", layoutId: "modern", colorSchemeId: "grape" },
  tropical: { label: "Tropical (teal/coral)", layoutId: "modern", colorSchemeId: "tropical" },
  mint: { label: "Mint (fresh)", layoutId: "modern", colorSchemeId: "mint" },
  sky: { label: "Sky (bright blue)", layoutId: "modern", colorSchemeId: "sky" },
  coral: { label: "Coral (warm)", layoutId: "modern", colorSchemeId: "coral" },
  flamingo: { label: "Flamingo (hot pink)", layoutId: "modern", colorSchemeId: "flamingo" },
  popart: { label: "Pop Art (comic)", layoutId: "classic", colorSchemeId: "popart" },
  arcade2: { label: "Arcade+ (extra fun)", layoutId: "modern", colorSchemeId: "arcade2" },
  hologram: { label: "Hologram (iridescent)", layoutId: "modern", colorSchemeId: "hologram" },
  galaxy: { label: "Galaxy (space neon)", layoutId: "modern", colorSchemeId: "galaxy" },
  synthwave: { label: "Synthwave (80s)", layoutId: "modern", colorSchemeId: "synthwave" },
  lava: { label: "Lava (red/orange)", layoutId: "modern", colorSchemeId: "lava" },
  lemonade: { label: "Lemonade (summer)", layoutId: "modern", colorSchemeId: "lemonade" },
  cottoncandy: { label: "Cotton Candy (pastel pop)", layoutId: "modern", colorSchemeId: "cottoncandy" },
  sprinkles: { label: "Sprinkles (cute)", layoutId: "modern", colorSchemeId: "sprinkles" },
  comic: { label: "Comic (ink + color)", layoutId: "classic", colorSchemeId: "comic" },
  playground: { label: "Playground (primary)", layoutId: "modern", colorSchemeId: "playground" },
} as const satisfies Record<string, LegacyTemplateConfig>;

const DEFAULT_LEGACY_TEMPLATE_ID: LegacyResumeTemplateId = "modern";

function toTemplateLookupKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "");
}

const EXPLICIT_TEMPLATE_ALIASES: Record<string, LegacyResumeTemplateId> = {
  modernclean: "modern",
  modernblue: "modern",
  classicblack: "classic",
  minimalslate: "minimal",
  executiveviolet: "executive",
  serifink: "serif",
  atsplain: "ats",
  sidebarleft: "sidebar",
  sidebarlayout: "sidebar",
  sidebar2column: "sidebar",
  twocolumnsidebar: "sidebar",
  sidebarright: "sidebarright",
  rightsidebar: "sidebarright",
  sidebarrightlayout: "sidebarright",
  gridblueprint: "gridblueprint",
  blueprintlayout: "gridblueprint",
  profilepanel: "profilepanel",
  profilepanelresume: "profilepanel",
  timelineprofessional: "timelineprofessional",
  timeline: "timelineprofessional",
  corporatepolished: "corporatepolishedlayout",
  corporatepolishedlayout: "corporatepolishedlayout",
  technicalgrid: "technicalgridlayout",
  technicalgridlayout: "technicalgridlayout",
  compactdense: "compact",
  highcontrast: "contrast",
  blueprinttech: "blueprint",
  gridblueprintplus: "grid",
  paperwarmserif: "paper",
  inkdashededitorial: "ink",
  corporatepolished: "corporate",
  minimalistsoft: "minimalist",
  arcadefun: "arcade",
  arcadeextrafun: "arcade2",
  bubblegumpinkpop: "bubblegum",
  limepopbrightgreen: "limepop",
  citrusorangelemon: "citrus",
  electriccyanpurple: "electric",
  confettiparty: "confetti",
  rainbowbold: "rainbow",
  sunnyyellow: "sunny",
  watermelonpinkgreen: "watermelon",
  grapepurple: "grape",
  tropicaltealcoral: "tropical",
  mintfresh: "mint",
  skybrightblue: "sky",
  coralwarm: "coral",
  flamingohotpink: "flamingo",
  popartcomic: "popart",
  hologramiridescent: "hologram",
  galaxyspaceneon: "galaxy",
  synthwave80s: "synthwave",
  lavaredorange: "lava",
  lemonadesummer: "lemonade",
  cottoncandypastelpop: "cottoncandy",
  sprinklescute: "sprinkles",
  comicinkcolor: "comic",
  playgroundprimary: "playground",
};

const TEMPLATE_ID_ALIASES: Record<string, LegacyResumeTemplateId> = buildTemplateIdAliases();

function buildTemplateIdAliases(): Record<string, LegacyResumeTemplateId> {
  const aliasMap: Record<string, LegacyResumeTemplateId> = { ...EXPLICIT_TEMPLATE_ALIASES };

  (Object.keys(LEGACY_TEMPLATE_CONFIG) as LegacyResumeTemplateId[]).forEach((legacyId) => {
    const config = LEGACY_TEMPLATE_CONFIG[legacyId];
    aliasMap[toTemplateLookupKey(legacyId)] = legacyId;
    aliasMap[toTemplateLookupKey(config.label)] = legacyId;
    aliasMap[toTemplateLookupKey(config.layoutId)] ??= legacyId;
    aliasMap[toTemplateLookupKey(config.colorSchemeId)] ??= legacyId;
  });

  return aliasMap;
}

export const TEMPLATE_OPTIONS: LegacyResumeTemplateOption[] = Object.entries(LEGACY_TEMPLATE_CONFIG).map(
  ([id, config]) => ({
    id: id as LegacyResumeTemplateId,
    label: config.label,
  }),
);

export function isLegacyResumeTemplateId(value: string): value is LegacyResumeTemplateId {
  return value in LEGACY_TEMPLATE_CONFIG;
}

export function normalizeLegacyResumeTemplateId(
  value: string | null | undefined,
  fallbackId: LegacyResumeTemplateId = DEFAULT_LEGACY_TEMPLATE_ID,
): TemplateMigrationInfo {
  const trimmedInput = String(value ?? "").trim();

  if (trimmedInput && isLegacyResumeTemplateId(trimmedInput)) {
    return {
      input: trimmedInput,
      normalizedInput: trimmedInput,
      resolvedLegacyId: trimmedInput,
      reason: "exact",
      matchedFrom: trimmedInput,
    };
  }

  const normalizedInput = trimmedInput ? toTemplateLookupKey(trimmedInput) : null;
  const aliasMatch = normalizedInput ? TEMPLATE_ID_ALIASES[normalizedInput] : null;

  if (aliasMatch) {
    return {
      input: trimmedInput || null,
      normalizedInput,
      resolvedLegacyId: aliasMatch,
      reason: "alias",
      matchedFrom: normalizedInput,
    };
  }

  return {
    input: trimmedInput || null,
    normalizedInput,
    resolvedLegacyId: fallbackId,
    reason: "fallback",
    matchedFrom: null,
  };
}

export function normalizeStoredResumeTemplateValue(
  value: string | null | undefined,
  fallbackId: LegacyResumeTemplateId = DEFAULT_LEGACY_TEMPLATE_ID,
): LegacyResumeTemplateId {
  return normalizeLegacyResumeTemplateId(value, fallbackId).resolvedLegacyId;
}

export function resolveLegacyResumeTemplateSelection(
  templateId: string | null | undefined,
  fallbackId: LegacyResumeTemplateId = DEFAULT_LEGACY_TEMPLATE_ID,
): LegacyResumeTemplateSelection {
  const migration = normalizeLegacyResumeTemplateId(templateId, fallbackId);
  const config = LEGACY_TEMPLATE_CONFIG[migration.resolvedLegacyId];

  return {
    legacyId: migration.resolvedLegacyId,
    label: config.label,
    layoutId: config.layoutId,
    colorSchemeId: config.colorSchemeId,
    layout: RESUME_LAYOUTS[config.layoutId] ?? RESUME_LAYOUTS[DEFAULT_RESUME_LAYOUT_ID],
    colorScheme: COLOR_SCHEMES[config.colorSchemeId] ?? COLOR_SCHEMES[DEFAULT_COLOR_SCHEME_ID],
    migration,
  };
}

export type ResumeTemplateId = LegacyResumeTemplateId;

export type ResumeLayoutOption = {
  id: ResumeLayoutId;
  label: string;
  category: TemplateCategory;
  legacyIds: LegacyResumeTemplateId[];
};

export type ResumeColorSchemeOption = {
  id: ColorSchemeId;
  label: string;
  category: ColorSchemeCategory;
  categoryLabel: string;
  legacyIds: LegacyResumeTemplateId[];
};

const RESUME_COLOR_SCHEME_CATEGORY_LABELS: Record<ColorSchemeCategory, string> = {
  professional: "Professional",
  warm: "Warm",
  soft: "Soft",
  bold: "Bold",
  dark: "Dark",
};

export const RESUME_LAYOUT_OPTIONS: ResumeLayoutOption[] = Object.values(RESUME_LAYOUTS).map((layout) => ({
  id: layout.id,
  label: layout.label,
  category: layout.category,
  legacyIds: Object.entries(LEGACY_TEMPLATE_CONFIG)
    .filter(([, config]) => config.layoutId === layout.id)
    .map(([id]) => id as LegacyResumeTemplateId),
}));

export const RESUME_LAYOUT_CATEGORY_ORDER: TemplateCategory[] = [
  "ats-safe",
  "professional",
  "editorial",
  "technical",
  "creative",
];

export const RESUME_LAYOUT_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  "ats-safe": "ATS Safe",
  professional: "Professional",
  editorial: "Editorial",
  technical: "Technical",
  creative: "Creative",
};

export const RESUME_COLOR_SCHEME_OPTIONS: ResumeColorSchemeOption[] = Object.values(COLOR_SCHEMES).map((scheme) => ({
  id: scheme.id,
  label: scheme.label,
  category: scheme.category,
  categoryLabel: RESUME_COLOR_SCHEME_CATEGORY_LABELS[scheme.category],
  legacyIds: Object.entries(LEGACY_TEMPLATE_CONFIG)
    .filter(([, config]) => config.colorSchemeId === scheme.id)
    .map(([id]) => id as LegacyResumeTemplateId),
}));

const DEFAULT_TEMPLATE_BY_LAYOUT: Record<ResumeLayoutId, LegacyResumeTemplateId> = {
  modern: "modern",
  classic: "classic",
  minimal: "minimal",
  executive: "executive",
  compact: "compact",
  sidebar: "sidebar",
  "sidebar-right": "sidebarright",
  "grid-blueprint": "gridblueprint",
  "profile-panel": "profilepanel",
  timeline: "timelineprofessional",
  "corporate-polished": "corporatepolishedlayout",
  "technical-grid": "technicalgridlayout",
  serif: "serif",
  ats: "ats",
};

export function buildResumeTemplateSelection(
  layoutId: ResumeLayoutId,
  colorSchemeId: ColorSchemeId,
): LegacyResumeTemplateSelection {
  const exactMatch = Object.entries(LEGACY_TEMPLATE_CONFIG).find(
    ([, config]) => config.layoutId === layoutId && config.colorSchemeId === colorSchemeId,
  );

  if (exactMatch) {
    return resolveLegacyResumeTemplateSelection(exactMatch[0]);
  }

  const sameLayoutMatch = Object.entries(LEGACY_TEMPLATE_CONFIG).find(
    ([, config]) => config.layoutId === layoutId,
  );

  if (sameLayoutMatch) {
    return resolveLegacyResumeTemplateSelection(sameLayoutMatch[0]);
  }

  const fallbackId = DEFAULT_TEMPLATE_BY_LAYOUT[layoutId] ?? DEFAULT_LEGACY_TEMPLATE_ID;
  return resolveLegacyResumeTemplateSelection(fallbackId);
}

export function getRecommendedColorSchemeForLayout(layoutId: ResumeLayoutId): ColorSchemeId {
  const fallbackId = DEFAULT_TEMPLATE_BY_LAYOUT[layoutId] ?? DEFAULT_LEGACY_TEMPLATE_ID;
  return LEGACY_TEMPLATE_CONFIG[fallbackId]?.colorSchemeId ?? DEFAULT_COLOR_SCHEME_ID;
}
