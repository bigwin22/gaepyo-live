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
    const photoCachePayload = await fetchPhotoCachePayload(request);
    const payload = await buildLatestPayload({
      outputPath: "data/latest.json",
      photoCachePayload,
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

async function fetchPhotoCachePayload(request) {
  try {
    const host = request.headers?.["x-forwarded-host"] ?? request.headers?.host;
    if (!host) return null;

    const protocol = request.headers?.["x-forwarded-proto"] ?? "https";
    const response = await fetch(`${protocol}://${host}/data/latest.json`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
