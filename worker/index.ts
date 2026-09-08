import { GreenhouseCollector } from "./collectors/greenhouse.js";

import {
  runConfiguredCompanyScan,
} from "./scanning/run-configured-company-scan.js";

import {
  runCompanyScan,
} from "./scanning/run-company-scan.js";

import {
  StaticCollector,
} from "./testing/static-collector.js";

import {
  getFreshnessScenario,
} from "./testing/freshness-scenarios.js";


type CompanyRow = {
  id: string;
  name: string;
  category: string;
  careersUrl: string;
  collectorType: string;
  priorityTier: string;
  sourceKey: string | null;
};


export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url =
      new URL(request.url);


    /*
     * HEALTH CHECK
     */
    if (
      request.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return Response.json({
        status: "ok",

        service:
          "joli-checker",

        timestamp:
          new Date().toISOString(),
      });
    }


    /*
     * ACTIVE COMPANIES
     */
    if (
      request.method === "GET" &&
      url.pathname === "/api/companies"
    ) {
      const result =
        await env.DB.prepare(`
          SELECT
            id,
            name,
            category,

            careers_url
              AS careersUrl,

            collector_type
              AS collectorType,

            priority_tier
              AS priorityTier,

            source_key
              AS sourceKey

          FROM companies

          WHERE is_active = 1

          ORDER BY name
        `).all<CompanyRow>();


      return Response.json({
        companies:
          result.results,
      });
    }


    /*
     * TEMPORARY DEBUG:
     *
     * Fetch Stripe directly from
     * Greenhouse without persisting it.
     *
     * We'll eventually remove this route.
     */
    if (
      request.method === "GET" &&
      url.pathname ===
        "/api/debug/stripe-jobs"
    ) {
      const collector =
        new GreenhouseCollector(
          "stripe",
          "stripe",
        );


      const result =
        await collector.collect();


      return Response.json({
        fetchedAt:
          result.fetchedAt,

        totalJobs:
          result.jobs.length,

        warnings:
          result.warnings,

        sample:
          result.jobs.slice(
            0,
            5,
          ),
      });
    }


    /*
     * GENERIC CONFIGURED COMPANY SCAN
     *
     * Examples:
     *
     * POST /api/debug/company-scan/stripe
     * POST /api/debug/company-scan/amazon
     */
    const companyScanPrefix =
      "/api/debug/company-scan/";


    if (
      request.method === "POST" &&
      url.pathname.startsWith(
        companyScanPrefix,
      )
    ) {
      const companyId =
        decodeURIComponent(
          url.pathname.slice(
            companyScanPrefix.length,
          ),
        ).trim();


      if (!companyId) {
        return Response.json(
          {
            error:
              "Company ID is required",
          },
          {
            status: 400,
          },
        );
      }


      try {
        const result =
          await runConfiguredCompanyScan(
            env.DB,
            companyId,
          );


        return Response.json(
          result,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);


        return Response.json(
          {
            error:
              message,
          },
          {
            status: 400,
          },
        );
      }
    }


    /*
     * CONTROLLED FRESHNESS TEST
     *
     * POST /api/debug/freshness-scan/1
     * POST /api/debug/freshness-scan/2
     * POST /api/debug/freshness-scan/3
     */
    const freshnessTestPrefix =
      "/api/debug/freshness-scan/";


    if (
      request.method === "POST" &&
      url.pathname.startsWith(
        freshnessTestPrefix,
      )
    ) {
      const scenario =
        url.pathname.slice(
          freshnessTestPrefix.length,
        );


      const jobs =
        getFreshnessScenario(
          scenario,
        );


      const collector =
        new StaticCollector(
          jobs,
        );


      const result =
        await runCompanyScan(
          env.DB,
          "testco",
          collector,
        );


      return Response.json({
        scenario,
        ...result,
      });
    }


    /*
     * FALLBACK
     */
    return Response.json(
      {
        error:
          "Not Found",
      },
      {
        status: 404,
      },
    );
  },
} satisfies ExportedHandler<Env>;