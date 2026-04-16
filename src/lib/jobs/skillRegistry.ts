export type CanonicalSkill = {
  canonical: string;
  aliases: string[];
};

export type ConceptSignal = {
  canonical: string;
  aliases: string[];
};

const NORMALIZATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&/g, " and "],
  [/\bfullstack\b/g, "full stack"],
  [/\bfront-end\b/g, "front end"],
  [/\bback-end\b/g, "back end"],
  [/[._/]+/g, " "],
  [/\s+/g, " "],
];

export const CANONICAL_SKILLS: CanonicalSkill[] = [
  { canonical: "c#", aliases: ["c#", "c sharp"] },
  { canonical: "c++", aliases: ["c++", "cpp"] },
  { canonical: "java", aliases: ["java"] },
  { canonical: ".net", aliases: [".net", "dotnet", "asp.net", "asp net"] },
  { canonical: "unity", aliases: ["unity", "unity 3d", "unity3d"] },
  { canonical: "unreal engine", aliases: ["unreal engine", "unreal"] },
  { canonical: "oop", aliases: ["oop", "object oriented programming", "object-oriented programming"] },
  { canonical: "design patterns", aliases: ["design patterns"] },
  { canonical: "wpf", aliases: ["wpf", "windows presentation foundation"] },
  { canonical: "winforms", aliases: ["winforms", "windows forms"] },
  { canonical: "qt", aliases: ["qt", "qt framework"] },
  { canonical: "sql", aliases: ["sql"] },
  { canonical: "postgresql", aliases: ["postgresql", "postgres"] },
  { canonical: "mysql", aliases: ["mysql"] },
  { canonical: "aws", aliases: ["aws", "amazon web services"] },
  { canonical: "azure", aliases: ["azure"] },
  { canonical: "gcp", aliases: ["gcp", "google cloud platform", "google cloud"] },
  { canonical: "docker", aliases: ["docker", "containerized technologies", "containerized technology"] },
  { canonical: "kubernetes", aliases: ["kubernetes", "k8s", "container orchestration"] },
  { canonical: "terraform", aliases: ["terraform"] },
  { canonical: "ansible", aliases: ["ansible"] },
  { canonical: "jenkins", aliases: ["jenkins"] },
  { canonical: "git", aliases: ["git", "github", "gitlab", "bitbucket"] },
  { canonical: "linux", aliases: ["linux", "linux based systems", "linux-based systems"] },
  { canonical: "ci/cd", aliases: ["ci/cd", "cicd", "continuous integration", "continuous delivery", "continuous deployment"] },
  { canonical: "build/release systems", aliases: ["build release systems", "build/release systems", "build systems", "release systems", "build pipelines", "release pipelines"] },
  { canonical: "monitoring", aliases: ["monitoring", "observability", "logging"] },
  { canonical: "prometheus", aliases: ["prometheus"] },
  { canonical: "grafana", aliases: ["grafana"] },
  { canonical: "elk", aliases: ["elk", "elastic stack"] },
  { canonical: "new relic", aliases: ["newrelic", "new relic"] },
  { canonical: "redis", aliases: ["redis"] },
  { canonical: "kafka", aliases: ["kafka"] },
  { canonical: "graphql", aliases: ["graphql"] },
  { canonical: "rest api", aliases: ["rest api", "rest apis", "restful api", "restful apis"] },
  { canonical: "playwright", aliases: ["playwright"] },
  { canonical: "selenium", aliases: ["selenium"] },
  { canonical: "cypress", aliases: ["cypress"] },
  { canonical: "postman", aliases: ["postman"] },
  { canonical: "iterable", aliases: ["iterable"] },
  { canonical: "braze", aliases: ["braze"] },
  { canonical: "salesforce", aliases: ["salesforce", "salesforce marketing cloud", "sfmc"] },
  { canonical: "hubspot", aliases: ["hubspot", "hub spot"] },
  { canonical: "klaviyo", aliases: ["klaviyo"] },
  { canonical: "marketo", aliases: ["marketo", "adobe marketo"] },
  { canonical: "mailchimp", aliases: ["mailchimp", "mail chimp"] },
  { canonical: "customer.io", aliases: ["customer.io", "customer io"] },
  { canonical: "simon data", aliases: ["simon data"] },
  { canonical: "blueshift", aliases: ["blueshift"] },
  { canonical: "litmus", aliases: ["litmus"] },
  { canonical: "email on acid", aliases: ["email on acid"] },
  { canonical: "javascript", aliases: ["javascript", "js"] },
  { canonical: "typescript", aliases: ["typescript", "ts"] },
  { canonical: "react", aliases: ["react"] },
  { canonical: "next.js", aliases: ["next.js", "nextjs"] },
  { canonical: "node.js", aliases: ["node.js", "nodejs", "node"] },
  { canonical: "python", aliases: ["python"] },
  { canonical: "go", aliases: ["go", "golang"] },
  { canonical: "rust", aliases: ["rust"] },
  { canonical: "swift", aliases: ["swift"] },
  { canonical: "kotlin", aliases: ["kotlin"] },
  { canonical: "jira", aliases: ["jira"] },
  { canonical: "confluence", aliases: ["confluence"] },
  { canonical: "notion", aliases: ["notion"] },
  { canonical: "tempo", aliases: ["tempo"] },
  { canonical: "figma", aliases: ["figma"] },
  { canonical: "photoshop", aliases: ["photoshop", "adobe photoshop"] },
  { canonical: "freshdesk", aliases: ["freshdesk"] },
  { canonical: "excel", aliases: ["excel", "spreadsheets"] },
  { canonical: "manual testing", aliases: ["manual testing", "functional testing", "exploratory testing", "regression testing"] },
  { canonical: "test automation", aliases: ["test automation", "automation testing", "qa automation", "automation frameworks"] },
  { canonical: "api testing", aliases: ["api testing"] },
  { canonical: "test planning", aliases: ["test planning", "test plan", "test plans", "test strategy", "test cases", "test case", "acceptance criteria"] },
  { canonical: "bug triage", aliases: ["bug triage", "bug tracking", "defect tracking", "bug reporting"] },
  { canonical: "agile", aliases: ["agile", "scrum", "sprint planning", "retrospectives"] },
  { canonical: "playable ads", aliases: ["playable ads", "playable ad", "ad creatives"] },
  { canonical: "profiling tools", aliases: ["profiling tools", "cpu profiling", "gpu profiling"] },
  { canonical: "multithreading", aliases: ["multithreading", "multi-threading", "multithreaded"] },
  { canonical: "data driven development", aliases: ["data-driven development", "data driven development"] },
  { canonical: "quality assurance", aliases: ["quality assurance", "platform quality", "platform quality analyst"] },
  { canonical: "auditing", aliases: ["auditing", "quality audits", "audit inventory", "audit ad creatives"] },
  { canonical: "reporting", aliases: ["reporting", "comprehensive reports"] },
  { canonical: "compliance", aliases: ["compliance", "advertising laws", "brand-safe advertising practices"] },
  { canonical: "troubleshooting", aliases: ["troubleshooting", "investigative mindset", "problem solving"] },
  { canonical: "documentation", aliases: ["documentation", "record-keeping practices"] },
  { canonical: "data hygiene", aliases: ["data hygiene", "record-keeping", "data validation"] },
];

export const CONCEPT_SIGNALS: ConceptSignal[] = [
  { canonical: "software engineering", aliases: ["software engineering", "software development", "application development"] },
  { canonical: "game development", aliases: ["game development", "game programming", "game engineering"] },
  { canonical: "engine development", aliases: ["engine development", "engine programmer", "engine programming"] },
  { canonical: "mobile development", aliases: ["mobile development", "mobile game development"] },
  { canonical: "performance optimization", aliases: ["performance", "optimization", "optimisation", "performance targets"] },
  { canonical: "code review", aliases: ["code review", "code-review", "peer review"] },
  { canonical: "code quality", aliases: ["well structured code", "well-structured code", "clean code", "maintainable code", "robust code"] },
  { canonical: "teamwork", aliases: ["teamwork", "cross functional collaboration", "cross-functional collaboration", "collaboration"] },
  { canonical: "build/release", aliases: ["build release", "build/release", "release engineering"] },
  { canonical: "infrastructure as code", aliases: ["infrastructure as code", "iac"] },
  { canonical: "distributed systems", aliases: ["distributed systems", "scalable systems"] },
  { canonical: "system design", aliases: ["system design", "systems design", "architecture", "architectural design"] },
  { canonical: "crm", aliases: ["crm", "customer relationship management"] },
  { canonical: "martech", aliases: ["martech", "mar tech", "marketing technology"] },
  { canonical: "saas", aliases: ["saas", "software as a service"] },
  { canonical: "marketing automation", aliases: ["marketing automation"] },
  { canonical: "email production", aliases: ["email production", "email operations", "campaign production"] },
  { canonical: "email development", aliases: ["email development", "email developer", "email coding"] },
  { canonical: "email qa", aliases: ["email qa", "email quality assurance", "email testing"] },
  { canonical: "html email", aliases: ["html email", "html emails", "email templates"] },
  { canonical: "responsive email", aliases: ["responsive email", "responsive emails", "email rendering"] },
  { canonical: "dynamic content", aliases: ["dynamic content", "dynamic email content"] },
  { canonical: "campaign analytics", aliases: ["campaign analytics", "campaign performance", "campaign reporting"] },
  { canonical: "a/b testing", aliases: ["a/b testing", "ab testing", "split testing", "multivariate testing"] },
  { canonical: "segmentation", aliases: ["segmentation", "audience segmentation"] },
  { canonical: "personalization", aliases: ["personalization", "personalisation"] },
  { canonical: "lifecycle marketing", aliases: ["lifecycle marketing", "customer lifecycle"] },
  { canonical: "retention marketing", aliases: ["retention marketing"] },
  { canonical: "push notifications", aliases: ["push notifications", "push notification", "mobile push"] },
  { canonical: "sms marketing", aliases: ["sms marketing", "sms campaigns", "text messaging campaigns"] },
  { canonical: "cross-channel", aliases: ["cross-channel", "multi-channel", "omnichannel"] },
  { canonical: "deliverability", aliases: ["deliverability", "inbox placement"] },
  { canonical: "can-spam", aliases: ["can-spam", "can spam"] },
  { canonical: "client services", aliases: ["client services"] },
  { canonical: "managed services", aliases: ["managed services"] },
  { canonical: "resource allocation", aliases: ["resource allocation", "resource planning", "resourcing"] },
  { canonical: "capacity planning", aliases: ["capacity planning"] },
  { canonical: "delivery operations", aliases: ["delivery operations", "delivery ops"] },
  { canonical: "retainer model", aliases: ["retainer model", "retainer based", "retainer-based"] },
  { canonical: "stakeholder reporting", aliases: ["stakeholder reporting", "executive reporting"] },
  { canonical: "dependency management", aliases: ["dependency management", "dependency tracking"] },
  { canonical: "operational cadence", aliases: ["operational cadence", "delivery cadence"] },
  { canonical: "debugging", aliases: ["debugging", "troubleshooting", "debug", "problem-solving"] },
  { canonical: "testing", aliases: ["testing", "test features", "software testing"] },
  { canonical: "automation", aliases: ["automation", "automated workflows"] },
  { canonical: "monitoring", aliases: ["monitoring", "observability", "logging"] },
  { canonical: "gameplay systems", aliases: ["gameplay systems", "game features", "game mechanics", "in-game mechanics"] },
  { canonical: "user interface", aliases: ["user interface", "ui"] },
  { canonical: "graphics programming", aliases: ["programming graphics", "graphics programming", "rendering"] },
  { canonical: "security", aliases: ["security", "privacy"] },
  { canonical: "mentoring", aliases: ["mentoring", "coaching", "support team members"] },
  { canonical: "stakeholder management", aliases: ["stakeholder management", "client support", "respond to inquiries"] },
  { canonical: "technical leadership", aliases: ["technical leadership", "leadership"] },
  { canonical: "quality operations", aliases: ["quality assurance", "platform quality", "quality standards"] },
  { canonical: "auditing", aliases: ["auditing", "quality audits"] },
  { canonical: "compliance", aliases: ["compliance", "brand-safe advertising", "advertising laws", "regulations"] },
  { canonical: "reporting", aliases: ["reporting", "reports", "analyzing data to identify trends"] },
  { canonical: "training", aliases: ["training support", "training sessions", "coordinating training sessions"] },
  { canonical: "documentation", aliases: ["documentation", "record-keeping", "process documentation"] },
  { canonical: "data hygiene", aliases: ["data hygiene", "record-keeping practices"] },
  { canonical: "detail orientation", aliases: ["attention to detail", "detail-oriented", "detail oriented"] },
  { canonical: "project delivery", aliases: ["end-to-end delivery", "predictable project outcomes", "timely delivery"] },
  { canonical: "people management", aliases: ["people management", "direct reports", "onboarding", "probation evaluation"] },
  { canonical: "workflow optimization", aliases: ["workflows and pipelines", "improve efficiencies", "optimize the flow of communication"] },
  { canonical: "multithreaded systems", aliases: ["multithreading", "multithreaded", "multi-threading"] },
  { canonical: "profiling and optimization", aliases: ["cpu profiling", "gpu profiling", "optimise code", "optimize code"] },
  { canonical: "shipped games", aliases: ["shipped games", "track record of contributions to shipped games"] },
  { canonical: "ad tech", aliases: ["advertising campaigns", "programmatic advertising", "performance marketing", "playable ads"] },
];

export const SKILL_DISPLAY_PRIORITY = [
  "c#",
  "c++",
  "java",
  ".net",
  "unity",
  "unreal engine",
  "oop",
  "design patterns",
  "playable ads",
  "profiling tools",
  "multithreading",
  "data driven development",
  "docker",
  "kubernetes",
  "terraform",
  "ansible",
  "jenkins",
  "ci/cd",
  "build/release systems",
  "aws",
  "azure",
  "gcp",
  "sql",
  "postgresql",
  "mysql",
  "linux",
  "prometheus",
  "grafana",
  "elk",
  "new relic",
  "redis",
  "kafka",
  "graphql",
  "rest api",
  "playwright",
  "selenium",
  "cypress",
  "postman",
  "iterable",
  "braze",
  "salesforce",
  "hubspot",
  "klaviyo",
  "marketo",
  "mailchimp",
  "customer.io",
  "simon data",
  "blueshift",
  "litmus",
  "email on acid",
  "typescript",
  "javascript",
  "react",
  "next.js",
  "node.js",
  "python",
  "go",
  "rust",
  "swift",
  "kotlin",
  "jira",
  "confluence",
  "notion",
  "tempo",
  "figma",
  "photoshop",
  "freshdesk",
  "excel",
  "manual testing",
  "test automation",
  "api testing",
  "test planning",
  "bug triage",
  "agile",
  "quality assurance",
  "auditing",
  "reporting",
  "compliance",
  "troubleshooting",
  "documentation",
  "data hygiene",
  "crm",
  "martech",
  "saas",
  "marketing automation",
  "email production",
  "email development",
  "email qa",
  "html email",
  "responsive email",
  "dynamic content",
  "campaign analytics",
  "a/b testing",
  "segmentation",
  "personalization",
  "lifecycle marketing",
  "retention marketing",
  "push notifications",
  "sms marketing",
  "cross-channel",
  "deliverability",
  "can-spam",
  "client services",
  "managed services",
  "resource allocation",
  "capacity planning",
  "delivery operations",
  "retainer model",
  "stakeholder reporting",
  "dependency management",
  "operational cadence",
] as const;

export const CONCEPT_DISPLAY_PRIORITY = [
  "crm",
  "martech",
  "marketing automation",
  "email production",
  "email development",
  "email qa",
  "html email",
  "responsive email",
  "dynamic content",
  "campaign analytics",
  "a/b testing",
  "segmentation",
  "personalization",
  "lifecycle marketing",
  "retention marketing",
  "push notifications",
  "sms marketing",
  "cross-channel",
  "deliverability",
  "can-spam",
  "client services",
  "managed services",
  "resource allocation",
  "capacity planning",
  "delivery operations",
  "retainer model",
  "stakeholder reporting",
  "dependency management",
  "operational cadence",
  "saas",
  "quality operations",
  "auditing",
  "testing",
  "debugging",
  "reporting",
  "compliance",
  "documentation",
  "data hygiene",
  "detail orientation",
  "game development",
  "engine development",
  "gameplay systems",
  "mobile development",
  "performance optimization",
  "profiling and optimization",
  "multithreaded systems",
  "software engineering",
  "code review",
  "code quality",
  "workflow optimization",
  "project delivery",
  "people management",
  "stakeholder management",
  "mentoring",
  "teamwork",
  "ad tech",
  "system design",
  "distributed systems",
  "build/release",
  "monitoring",
] as const;

const WEAK_CONCEPT_SIGNALS = new Set([
  "teamwork",
  "security",
  "mentoring",
]);

const LOW_SPECIFICITY_SKILLS = new Set([
  "quality assurance",
  "auditing",
  "reporting",
  "compliance",
  "documentation",
  "data hygiene",
  "agile",
]);

const LOW_SPECIFICITY_CONCEPTS = new Set([
  "automation",
  "testing",
  "monitoring",
  "reporting",
  "documentation",
  "teamwork",
  "stakeholder management",
  "detail orientation",
  "workflow optimization",
]);

const GENERIC_SIGNAL_SUPPRESSION: Record<string, string[]> = {
  automation: [
    "marketing automation",
    "test automation",
    "iterable",
    "braze",
    "salesforce",
    "hubspot",
    "klaviyo",
    "marketo",
    "mailchimp",
    "customer.io",
    "simon data",
    "blueshift",
  ],
  testing: [
    "a/b testing",
    "email qa",
    "litmus",
    "email on acid",
    "manual testing",
    "test automation",
    "api testing",
  ],
  reporting: [
    "campaign analytics",
    "stakeholder reporting",
  ],
  documentation: [
    "confluence",
    "notion",
  ],
  "stakeholder management": [
    "stakeholder reporting",
    "client services",
    "managed services",
  ],
};

export function normalizeRegistryText(value: string): string {
  let normalized = value.toLowerCase().trim();
  for (const [pattern, replacement] of NORMALIZATION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/[^a-z0-9+#\s-]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createLoosePhrasePattern(value: string): RegExp {
  const normalizedValue = normalizeRegistryText(value);
  const escaped = escapeRegex(normalizedValue).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, "i");
}

function matchesPhrase(text: string, phrase: string): boolean {
  return createLoosePhrasePattern(phrase).test(normalizeRegistryText(text));
}

export function canonicalizeSkill(value: string): string {
  const normalized = normalizeRegistryText(value);
  if (!normalized) return "";

  for (const entry of CANONICAL_SKILLS) {
    if (normalized === entry.canonical) return entry.canonical;
    if (entry.aliases.some((alias) => normalized === normalizeRegistryText(alias))) {
      return entry.canonical;
    }
  }

  return normalized;
}

export function collectCanonicalSkills(values: string[]): string[] {
  const skills = new Set<string>();
  for (const value of values) {
    const normalized = canonicalizeSkill(value);
    if (!normalized) continue;
    const known = CANONICAL_SKILLS.some((entry) => entry.canonical === normalized);
    if (known) skills.add(normalized);
  }
  return Array.from(skills);
}

export function extractCanonicalSkillsFromText(text: string): string[] {
  const normalized = normalizeRegistryText(text);
  if (!normalized) return [];

  const skills = new Set<string>();
  for (const entry of CANONICAL_SKILLS) {
    if ([entry.canonical, ...entry.aliases].some((alias) => matchesPhrase(normalized, alias))) {
      skills.add(entry.canonical);
    }
  }

  return Array.from(skills);
}

export function extractConceptSignalsFromText(text: string): string[] {
  const normalized = normalizeRegistryText(text);
  if (!normalized) return [];

  const signals = new Set<string>();
  for (const entry of CONCEPT_SIGNALS) {
    if ([entry.canonical, ...entry.aliases].some((alias) => matchesPhrase(normalized, alias))) {
      signals.add(entry.canonical);
    }
  }

  return Array.from(signals).filter((signal) => !WEAK_CONCEPT_SIGNALS.has(signal));
}

export function sortCanonicalSkills(values: string[]): string[] {
  const unique = Array.from(new Set(values.map((value) => canonicalizeSkill(value)).filter(Boolean)));
  return unique.sort((left, right) => {
    const leftRank = SKILL_DISPLAY_PRIORITY.indexOf(left as (typeof SKILL_DISPLAY_PRIORITY)[number]);
    const rightRank = SKILL_DISPLAY_PRIORITY.indexOf(right as (typeof SKILL_DISPLAY_PRIORITY)[number]);
    const resolvedLeft = leftRank === -1 ? 999 : leftRank;
    const resolvedRight = rightRank === -1 ? 999 : rightRank;
    if (resolvedLeft !== resolvedRight) return resolvedLeft - resolvedRight;
    return left.localeCompare(right);
  });
}

export function sortConceptSignals(values: string[]): string[] {
  const unique = Array.from(new Set(values.map((value) => normalizeRegistryText(value)).filter(Boolean)));
  return unique.sort((left, right) => {
    const leftRank = CONCEPT_DISPLAY_PRIORITY.indexOf(left as (typeof CONCEPT_DISPLAY_PRIORITY)[number]);
    const rightRank = CONCEPT_DISPLAY_PRIORITY.indexOf(right as (typeof CONCEPT_DISPLAY_PRIORITY)[number]);
    const resolvedLeft = leftRank === -1 ? 999 : leftRank;
    const resolvedRight = rightRank === -1 ? 999 : rightRank;
    if (resolvedLeft !== resolvedRight) return resolvedLeft - resolvedRight;
    return left.localeCompare(right);
  });
}

export function getSignalSpecificity(value: string): number {
  const normalized = normalizeRegistryText(value);
  if (!normalized) return 0;

  const canonicalSkill = canonicalizeSkill(normalized);
  const knownSkill = CANONICAL_SKILLS.some((entry) => entry.canonical === canonicalSkill);
  if (knownSkill) {
    return LOW_SPECIFICITY_SKILLS.has(canonicalSkill) ? 1 : 3;
  }

  const knownConcept = CONCEPT_SIGNALS.some((entry) => entry.canonical === normalized);
  if (knownConcept) {
    return LOW_SPECIFICITY_CONCEPTS.has(normalized) ? 1 : 2;
  }

  return 1;
}

export function pruneGenericSignals(values: string[]): string[] {
  const normalizedValues = Array.from(
    new Set(
      values
        .map((value) => {
          const canonicalSkill = canonicalizeSkill(value);
          if (CANONICAL_SKILLS.some((entry) => entry.canonical === canonicalSkill)) return canonicalSkill;
          return normalizeRegistryText(value);
        })
        .filter(Boolean),
    ),
  );

  const available = new Set(normalizedValues);

  return normalizedValues.filter((value) => {
    const coveredBy = GENERIC_SIGNAL_SUPPRESSION[value];
    if (!coveredBy?.length) return true;
    return !coveredBy.some((specific) => available.has(canonicalizeSkill(specific)) || available.has(normalizeRegistryText(specific)));
  });
}
