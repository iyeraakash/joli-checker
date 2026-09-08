import type {
  NormalizedJob,
} from "../domain/job.js";


function createJob(
  externalJobId: string,
  title: string,
  location: string,
): NormalizedJob {
  return {
    companyId: "testco",
    externalJobId,

    title,
    location,

    description: null,

    jobUrl:
      `https://example.com/jobs/${externalJobId}`,

    employerPostedAt: null,

    postedPrecision: "UNKNOWN",

    freshnessConfidence: "UNKNOWN",
  };
}


export function getFreshnessScenario(
  scenario: string,
): NormalizedJob[] {
  if (scenario === "1") {
    return [
      createJob(
        "A",
        "Backend Engineer",
        "Toronto",
      ),

      createJob(
        "B",
        "Data Engineer",
        "Toronto",
      ),
    ];
  }


  if (scenario === "2") {
    return [
      /*
       * A still exists but its title changed.
       * Expected: UPDATED.
       */
      createJob(
        "A",
        "Senior Backend Engineer",
        "Toronto",
      ),

      /*
       * B disappeared.
       * Expected: REMOVED.
       *
       * C did not exist before.
       * Expected: NEW.
       */
      createJob(
        "C",
        "Platform Engineer",
        "Toronto",
      ),
    ];
  }


  if (scenario === "3") {
    return [
      createJob(
        "A",
        "Senior Backend Engineer",
        "Toronto",
      ),

      /*
       * B returns after being removed.
       * Expected: REAPPEARED.
       */
      createJob(
        "B",
        "Data Engineer",
        "Toronto",
      ),

      createJob(
        "C",
        "Platform Engineer",
        "Toronto",
      ),
    ];
  }


  throw new Error(
    `Unknown freshness scenario: ${scenario}`,
  );
}