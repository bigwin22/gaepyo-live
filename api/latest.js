import { readFile } from "node:fs/promises";

export const config = {
  maxDuration: 60,
};

const RESPONSE_CACHE_SECONDS = 60;
const STATIC_DATA_URL = new URL("../data/latest.json", import.meta.url);
export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const staticPayload = await readStaticPayload();
    if (!staticPayload) throw new Error("static data unavailable");

    sendOk(response, {
      ...staticPayload,
      delivery: {
        ...(staticPayload.delivery ?? {}),
        mode: "serverless-static-cache",
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

function sendOk(response, payload) {
  response.setHeader(
    "Cache-Control",
    `public, max-age=0, s-maxage=${RESPONSE_CACHE_SECONDS}, stale-while-revalidate=${RESPONSE_CACHE_SECONDS * 2}`,
  );
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.status(200).json(payload);
}

async function readStaticPayload() {
  try {
    return JSON.parse(await readFile(STATIC_DATA_URL, "utf8"));
  } catch {
    return null;
  }
}
