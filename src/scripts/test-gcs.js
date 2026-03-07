// src/scripts/test-gcs.js
require("dotenv").config({ path: ".env.local" });

const { Storage } = require("@google-cloud/storage");

async function main() {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("Missing GCS_BUCKET_NAME in .env.local");

  const storage = new Storage(); // uses GOOGLE_APPLICATION_CREDENTIALS file automatically
  const [buckets] = await storage.getBuckets();

  console.log("OK: Authenticated. Bucket count visible to this SA:", buckets.length);

  const bucket = storage.bucket(bucketName);
  const [exists] = await bucket.exists();
  console.log(`Bucket "${bucketName}" exists?`, exists);

  if (!exists) {
    console.log("If false: bucket name mismatch OR permissions problem.");
    process.exit(1);
  }

  console.log("✅ GCS access looks good.");
}

main().catch((err) => {
  console.error("❌ GCS test failed:", err?.message || err);
  process.exit(1);
});