import "dotenv/config";

import type { JobsAdapterSlug } from "../lib/jobs/adapters";
import { importJobsFromAdapter } from "../lib/jobs/import";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const adapter = args.get("adapter") as JobsAdapterSlug | undefined;
  const tokenOrSite = args.get("token") ?? args.get("site") ?? args.get("board");
  const includeCompensation = args.get("includeCompensation") !== "false";
  const companyOverride = args.get("company") ?? null;

  if (!adapter || !["greenhouse", "lever", "ashby"].includes(adapter)) {
    throw new Error("Missing or invalid --adapter. Use one of: greenhouse, lever, ashby.");
  }

  if (!tokenOrSite) {
    throw new Error("Missing board token or site slug. Use --board, --token, or --site.");
  }

  const result = await importJobsFromAdapter({
    adapter,
    tokenOrSite,
    includeCompensation,
    companyOverride,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("[import:jobs] failed");
  console.error(error);
  process.exit(1);
});
