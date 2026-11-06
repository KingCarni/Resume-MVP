import { prisma } from "@/lib/prisma";

async function main() {
  const poolId = process.env.DONATION_POOL_USER_ID || "donation_pool";

  const existing = await prisma.user.findUnique({ where: { id: poolId } });
  if (existing) {
    console.log("Pool user exists:", poolId);
    return;
  }

  await prisma.user.create({
    data: {
      id: poolId,
      email: `donation-pool@internal.local`,
      name: "Donation Pool",
    },
  });

  console.log("Created pool user:", poolId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });