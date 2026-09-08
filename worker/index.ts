import { GreenhouseCollector } from "./collectors/greenhouse.js";
import { runCompanyScan } from "./scanning/run-company-scan.js";

import { StaticCollector } from "./testing/static-collector.js";

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
        service: "joli-checker",
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
              AS priorityTier

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
     * DEBUG:
     * Fetch Stripe jobs from Greenhouse
     * but do NOT persist them.
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
     * DEBUG:
     * Run a real Stripe scan
     * and persist results into local D1
     * during local development.
     */
    if (
      request.method === "POST" &&
      url.pathname ===
        "/api/debug/stripe-scan"
    ) {
      const collector =
        new GreenhouseCollector(
          "stripe",
          "stripe",
        );


      const result =
        await runCompanyScan(
          env.DB,
          "stripe",
          collector,
        );


      return Response.json(
        result,
      );
    }


    /*
     * DEBUG:
     * Controlled freshness lifecycle test.
     *
     * Examples:
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
     * FALLBACK 404
     */
    return Response.json(
      {
        error: "Not Found",
      },
      {
        status: 404,
      },
    );
  },
} satisfies ExportedHandler<Env>;