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