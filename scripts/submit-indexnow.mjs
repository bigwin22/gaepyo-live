import { readFile } from "node:fs/promises";

const HOST = "vote.gubiko.com";
const KEY = "c7d4f8b0e4a94c0aa19e53d6f8b92a41";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP_PATH = "sitemap.xml";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_BATCH_SIZE = 10000;

const sitemap = await readFile(SITEMAP_PATH, "utf8");
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]).filter(Boolean);

if (!urls.length) {
  throw new Error(`No URLs found in ${SITEMAP_PATH}`);
}

for (const batch of chunk(urls, MAX_BATCH_SIZE)) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: KEY_LOCATION,
      urlList: batch,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`IndexNow submit failed: ${response.status} ${response.statusText} ${text}`.trim());
  }

  console.log(`Submitted ${batch.length} URLs to IndexNow: ${response.status} ${response.statusText}`);
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
