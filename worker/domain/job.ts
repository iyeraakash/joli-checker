export type PostedPrecision =
  | "EXACT_TIMESTAMP"
  | "DATE_ONLY"
  | "RELATIVE_TIME"
  | "UNKNOWN";

export type FreshnessConfidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "UNKNOWN";

export interface NormalizedJob {
  companyId: string;
  externalJobId: string;

  title: string;
  location: string | null;
  description: string | null;
  jobUrl: string;

  employerPostedAt: string | null;
  postedPrecision: PostedPrecision;
  freshnessConfidence: FreshnessConfidence;
}