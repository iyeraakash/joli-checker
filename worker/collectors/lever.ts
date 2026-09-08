import type {
  CollectorResult,
  JobCollector,
} from "./types.js";

import type {
  NormalizedJob,
} from "../domain/job.js";


type LeverCategories = {
  location?: string | null;
  allLocations?: string[] | null;
};


type LeverPosting = {
  id: string;
  text: string;
  categories?: LeverCategories;
  hostedUrl: string;
};


const PAGE_SIZE = 100;
const MAX_PAGES = 100;


export class LeverCollector implements JobCollector {
  private readonly companyId: string;
  private readonly siteName: string;


  constructor(
    companyId: string,
    siteName: string,
  ) {
    this.companyId =
      companyId;

    this.siteName =
      siteName;
  }


  async collect(): Promise<CollectorResult> {
    const fetchedAt =
      new Date().toISOString();

    const postings:
      LeverPosting[] = [];


    /*
     * Lever's postings endpoint supports
     * skip + limit pagination.
     *
     * Fetch every page so we never silently
     * monitor only the first group of jobs.
     */
    for (
      let page = 0;
      page < MAX_PAGES;
      page += 1
    ) {
      const skip =
        page * PAGE_SIZE;


      const url =
        new URL(
          `https://api.lever.co/v0/postings/` +
            `${encodeURIComponent(this.siteName)}`,
        );


      url.searchParams.set(
        "mode",
        "json",
      );

      url.searchParams.set(
        "skip",
        String(skip),
      );

      url.searchParams.set(
        "limit",
        String(PAGE_SIZE),
      );


      const response =
        await fetch(
          url.toString(),
          {
            headers: {
              Accept:
                "application/json",
            },
          },
        );


      if (!response.ok) {
        throw new Error(
          `Lever request failed for ` +
            `${this.companyId}: ` +
            `${response.status} ` +
            `${response.statusText}`,
        );
      }


      const payload =
        (await response.json()) as unknown;


      if (!Array.isArray(payload)) {
        throw new Error(
          `Lever returned an invalid ` +
            `jobs payload for ` +
            `${this.companyId}`,
        );
      }


      const pagePostings =
        payload as LeverPosting[];


      postings.push(
        ...pagePostings,
      );


      /*
       * A partial page means there are
       * no more postings to retrieve.
       */
      if (
        pagePostings.length <
        PAGE_SIZE
      ) {
        break;
      }


      /*
       * If we somehow reach our safety
       * ceiling while still receiving
       * full pages, fail rather than
       * silently returning partial data.
       */
      if (
        page ===
        MAX_PAGES - 1
      ) {
        throw new Error(
          `Lever pagination exceeded ` +
            `${MAX_PAGES} pages for ` +
            `${this.companyId}`,
        );
      }
    }


    const jobs:
      NormalizedJob[] =
      postings.map(
        (posting) => {
          const allLocations =
            posting.categories
              ?.allLocations;


          const location =
            allLocations &&
            allLocations.length > 0
              ? allLocations.join(
                  " | ",
                )
              : posting.categories
                    ?.location
                ?? null;


          return {
            companyId:
              this.companyId,

            externalJobId:
              posting.id,

            title:
              posting.text,

            location,

            description: null,

            jobUrl:
              posting.hostedUrl,

            employerPostedAt:
              null,

            postedPrecision:
              "UNKNOWN",

            freshnessConfidence:
              "UNKNOWN",
          };
        },
      );


    return {
      jobs,
      fetchedAt,
      warnings: [],
    };
  }
}