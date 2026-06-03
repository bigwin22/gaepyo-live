import { buildLatestPayload } from "../scripts/fetch-nec-results.mjs";

export const config = {
  maxDuration: 60,
};

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const payload = await buildLatestPayload({
      outputPath: "data/latest.json",
      withPhotos: false,
    });

    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.status(200).json({
      ...payload,
      delivery: {
        mode: "serverless-live",
        generatedBy: "api/latest.js",
      },
    });
  } catch (error) {
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.status(502).json({
      status: "error",
      generatedAt: new Date().toISOString(),
      errors: [error?.message ?? String(error)],
    });
  }
}
