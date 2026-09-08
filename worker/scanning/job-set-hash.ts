import type { NormalizedJob } from "../domain/job.js";

export async function createJobSetHash(
  jobs: NormalizedJob[],
): Promise<string> {
  const jobSignatures = jobs
    .map((job) =>
      [
        job.externalJobId,
        job.title,
        job.location ?? "",
        job.jobUrl,
        job.employerPostedAt ?? "",
        job.postedPrecision,
        job.freshnessConfidence,
      ].join("|"),
    )
    .sort();

  const input = jobSignatures.join("\n");

  const encoded = new TextEncoder().encode(input);

  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoded,
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}