// src/lib/pdf_ocr_google.ts
import { Storage } from "@google-cloud/storage";
import vision from "@google-cloud/vision";
import crypto from "crypto";

type OcrResult = {
  text: string;
  pages?: number;
  gcsInputUri: string;
  gcsOutputPrefix: string;
};

function getGoogleCredentialsOrNull() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  // Sometimes private_key newlines get escaped in env vars; normalize safely
  const parsed = JSON.parse(raw);
  if (parsed?.private_key && typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function makeStorageClient() {
  const creds = getGoogleCredentialsOrNull();
  return creds ? new Storage({ credentials: creds }) : new Storage();
}

function makeVisionClient() {
  const creds = getGoogleCredentialsOrNull();
  // ImageAnnotatorClient is what @google-cloud/vision exports for OCR
  const { ImageAnnotatorClient } = vision.v1;
  return creds ? new ImageAnnotatorClient({ credentials: creds }) : new ImageAnnotatorClient();
}

function assertEnv() {
  if (!process.env.GCS_BUCKET_NAME) throw new Error("Missing env: GCS_BUCKET_NAME");
  if (!process.env.GCP_PROJECT_ID) throw new Error("Missing env: GCP_PROJECT_ID");
}

/**
 * Runs async Vision OCR for PDFs using GCS input/output.
 * - Uploads PDF to gs://bucket/ocr-input/<id>.pdf
 * - Writes results to gs://bucket/ocr-output/<id>/
 * - Reads JSON output files and returns a single text blob
 */
export async function ocrPdfWithGoogleVision(pdfBytes: Buffer): Promise<OcrResult> {
  assertEnv();

  const bucketName = String(process.env.GCS_BUCKET_NAME);
  const storage = makeStorageClient();
  const visionClient = makeVisionClient();

  const id = crypto.randomBytes(8).toString("hex");
  const inputObject = `ocr-input/${Date.now()}-${id}.pdf`;
  const outputPrefix = `ocr-output/${Date.now()}-${id}/`;

  const bucket = storage.bucket(bucketName);

  // 1) Upload PDF to GCS
  await bucket.file(inputObject).save(pdfBytes, {
    contentType: "application/pdf",
    resumable: false,
    metadata: {
      cacheControl: "no-store",
    },
  });

  const gcsInputUri = `gs://${bucketName}/${inputObject}`;
  const gcsOutputPrefix = `gs://${bucketName}/${outputPrefix}`;

  // 2) Start async OCR job
  const request = {
    requests: [
      {
        inputConfig: {
          gcsSource: { uri: gcsInputUri },
          mimeType: "application/pdf",
        },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: {
          gcsDestination: { uri: gcsOutputPrefix },
          batchSize: 20,
        },
      },
    ],
  };

  const [operation] = await visionClient.asyncBatchAnnotateFiles(request as any);
  await operation.promise();

  // 3) Read output JSON blobs and stitch full text
  // Vision writes files like: ocr-output/.../output-1-to-1.json etc
  const [files] = await bucket.getFiles({ prefix: outputPrefix });

  const jsonFiles = files.filter((f) => f.name.endsWith(".json"));
  if (!jsonFiles.length) {
    throw new Error("OCR completed but no output JSON files found in GCS.");
  }

  // Sort for deterministic page order
  jsonFiles.sort((a, b) => a.name.localeCompare(b.name));

  let fullText = "";
  let pages: number | undefined;

  for (const f of jsonFiles) {
    const [buf] = await f.download();
    const payload = JSON.parse(buf.toString("utf8"));

    const responses = payload?.responses;
    if (Array.isArray(responses)) {
      for (const r of responses) {
        const text = r?.fullTextAnnotation?.text;
        if (typeof text === "string" && text.trim()) {
          if (fullText && !fullText.endsWith("\n")) fullText += "\n";
          fullText += text;
        }
      }
    }

    // Best-effort page count
    const first = responses?.[0];
    const metaPages = first?.context?.pageNumber ?? undefined;
    if (!pages && typeof metaPages === "number") pages = metaPages;
  }

  // Optional: cleanup input/output later. For now, leave them for debugging.
  return {
    text: fullText.trim(),
    pages,
    gcsInputUri,
    gcsOutputPrefix,
  };
}