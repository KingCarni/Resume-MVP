import "dotenv/config";

import type { JobsAdapterSlug } from "../lib/jobs/adapters";
import {
  importActiveJobSources,
  listJobImportSources,
  upsertJobImportSource,
} from "../lib/jobs/importRegistry";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) continue;

    const eqIndex = token.indexOf("=");
    if (eqIndex > -1) {
      args.set(token.slice(2, eqIndex), token.slice(eqIndex + 1));
      continue;
    }

    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";

    args.set(key, value);
  }

  return args;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.floor(parsed));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.get("action") ?? "run-due";

  if (action === "add") {
    const adapter = args.get("adapter") as JobsAdapterSlug | undefined;
    const tokenOrSite = args.get("token") ?? args.get("site") ?? args.get("board");
    const displayName = args.get("name") ?? args.get("displayName");
    const companyOverride = args.get("company") ?? null;
    const refreshHours = args.get("refreshHours")
      ? Number(args.get("refreshHours"))
      : null;

    if (!adapter || !["greenhouse", "lever", "ashby", "workday", "bamboohr"].includes(adapter)) {
      throw new Error("Missing or invalid --adapter. Use greenhouse, lever, ashby, workday, or bamboohr.");
    }

    if (!tokenOrSite) {
      throw new Error("Missing source identifier. Use --board, --site, or --token.");
    }

    if (!displayName) {
      throw new Error("Missing --name / --displayName.");
    }

    const result = await upsertJobImportSource({
      adapter,
      tokenOrSite,
      displayName,
      companyOverride,
      refreshHours,
      isActive: args.get("active") !== "false",
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (action === "list") {
    const result = await listJobImportSources({
      activeOnly: args.get("activeOnly") === "true",
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (action === "run-due" || action === "run-all") {
    const result = await importActiveJobSources({
      dueOnly: action === "run-due",
      limit: parsePositiveInt(args.get("limit")),
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error('Invalid --action. Use "add", "list", "run-due", or "run-all".');
}

main().catch((error) => {
  console.error("[import:registry] failed");
  console.error(error);
  process.exit(1);
});
