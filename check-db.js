const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  const dbInfo = await prisma.$queryRawUnsafe(
    "select current_database() as db, current_schema() as schema;"
  );

  const tables = await prisma.$queryRawUnsafe(
    "select table_name from information_schema.tables where table_schema = 'public';"
  );

  console.log("DB Info:", dbInfo);
  console.log("Tables in public schema:");
  console.table(tables);

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});