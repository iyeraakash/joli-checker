export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        service: "joli-checker",
        timestamp: new Date().toISOString(),
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
} satisfies ExportedHandler;