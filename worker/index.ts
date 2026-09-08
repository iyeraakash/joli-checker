import { GreenhouseCollector } from "./collectors/greenhouse.js";

type CompanyRow = {
  id: string;
  name: string;
  category: string;
  careersUrl: string;
  collectorType: string;
  priorityTier: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        service: "joli-checker",
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/companies") {
      const result = await env.DB.prepare(`
        SELECT
          id,
          name,
          category,
          careers_url AS careersUrl,
          collector_type AS collectorType,
          priority_tier AS priorityTier
        FROM companies
        WHERE is_active = 1
        ORDER BY name
      `).all<CompanyRow>();

      return Response.json({
        companies: result.results,
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/debug/stripe-jobs"
    ) {
      const collector = new GreenhouseCollector(
        "stripe",
        "stripe",
      );

      const result = await collector.collect();

      return Response.json({
        fetchedAt: result.fetchedAt,
        totalJobs: result.jobs.length,
        warnings: result.warnings,
        sample: result.jobs.slice(0, 5),
      });
    }

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