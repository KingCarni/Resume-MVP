import {
  DEFAULT_RESUME_LAYOUT_ID,
  RESUME_LAYOUTS,
  type ResumeLayoutDefinition,
  type ResumeLayoutId,
} from "./baseTokens";
import {
  COLOR_SCHEMES,
  DEFAULT_COLOR_SCHEME_ID,
  type ColorSchemeDefinition,
  type ColorSchemeId,
} from "./colorSchemes";

export type LegacyResumeTemplateId = keyof typeof LEGACY_TEMPLATE_CONFIG;

export type LegacyResumeTemplateOption = {
  id: LegacyResumeTemplateId;
  label: string;
};

export type LegacyResumeTemplateSelection = {
  legacyId: LegacyResumeTemplateId;
  label: string;
  layoutId: ResumeLayoutId;
  colorSchemeId: ColorSchemeId;
  layout: ResumeLayoutDefinition;
  colorScheme: ColorSchemeDefinition;
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

export const TEMPLATE_OPTIONS: LegacyResumeTemplateOption[] = Object.entries(LEGACY_TEMPLATE_CONFIG).map(
  ([id, config]) => ({
    id: id as LegacyResumeTemplateId,
    label: config.label,
  }),
);

export function isLegacyResumeTemplateId(value: string): value is LegacyResumeTemplateId {
  return value in LEGACY_TEMPLATE_CONFIG;
}

export function resolveLegacyResumeTemplateSelection(
  templateId: string | null | undefined,
): LegacyResumeTemplateSelection {
  const safeId: LegacyResumeTemplateId =
    templateId && isLegacyResumeTemplateId(templateId) ? templateId : "modern";
  const config = LEGACY_TEMPLATE_CONFIG[safeId];

  return {
    legacyId: safeId,
    label: config.label,
    layoutId: config.layoutId,
    colorSchemeId: config.colorSchemeId,
    layout: RESUME_LAYOUTS[config.layoutId] ?? RESUME_LAYOUTS[DEFAULT_RESUME_LAYOUT_ID],
    colorScheme: COLOR_SCHEMES[config.colorSchemeId] ?? COLOR_SCHEMES[DEFAULT_COLOR_SCHEME_ID],
  };
}
