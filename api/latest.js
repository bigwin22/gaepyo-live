import { readFile } from "node:fs/promises";
import { buildLatestPayload } from "../scripts/fetch-nec-results.mjs";

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
    if (!isLiveRefreshRequest(request)) {
      const staticPayload = await readStaticPayload();
      if (staticPayload) {
        sendOk(response, {
          ...staticPayload,
          delivery: {
            ...(staticPayload.delivery ?? {}),
            mode: "serverless-static-cache",
            generatedBy: "api/latest.js",
          },
        });
        return;
      }
    }

    const photoCachePayload = await fetchPhotoCachePayload(request);
    const payload = await buildLatestPayload({
      outputPath: "data/latest.json",
      photoCachePayload,
      withPhotos: false,
    });

    sendOk(response, {
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

function sendOk(response, payload) {
  response.setHeader(
    "Cache-Control",
    `public, max-age=0, s-maxage=${RESPONSE_CACHE_SECONDS}, stale-while-revalidate=${RESPONSE_CACHE_SECONDS * 2}`,
  );
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.status(200).json(payload);
}

function isLiveRefreshRequest(request) {
  try {
    const host = request.headers?.["x-forwarded-host"] ?? request.headers?.host ?? "localhost";
    const protocol = request.headers?.["x-forwarded-proto"] ?? "https";
    const url = new URL(request.url, `${protocol}://${host}`);
    return url.searchParams.get("live") === "1";
  } catch {
    return false;
  }
}

async function readStaticPayload() {
  try {
    return JSON.parse(await readFile(STATIC_DATA_URL, "utf8"));
  } catch {
    return null;
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
