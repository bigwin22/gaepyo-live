import { readFile, writeFile } from "node:fs/promises";

const SITE_URL = "https://gaepyo-live.vercel.app/";
const OG_IMAGE_URL = `${SITE_URL}assets/og-image.png`;
const DATA_PATH = "data/latest.json";
const INDEX_PATH = "index.html";
const SITEMAP_PATH = "sitemap.xml";

const SEO_START = "<!-- SEO_FALLBACK_START -->";
const SEO_END = "<!-- SEO_FALLBACK_END -->";

const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
const summary = buildSummary(data);

await writeFile(INDEX_PATH, updateIndex(await readFile(INDEX_PATH, "utf8"), data, summary));
await writeFile(SITEMAP_PATH, buildSitemap(summary.modifiedIso));

function buildSummary(payload) {
  const generatedAt = parseDate(payload.generatedAt);
  const modifiedIso = generatedAt.toISOString();
  const modifiedKst = formatKstDateTime(generatedAt);
  const regions = Array.isArray(payload.regions) ? payload.regions : [];
  const regionLeaders = regions
    .filter((region) => region?.cityName)
    .map((region) => ({
      cityName: region.cityName,
      shortName: region.shortName ?? region.cityName,
      countingRate: formatRate(region.countingRate),
      leaderName: region.leader?.name ?? "집계 대기",
      leaderParty: region.leader?.party ?? "",
      leaderRate: region.leader?.rate == null ? "득표율 대기" : formatRate(region.leader.rate),
      voteGap: region.voteGap == null ? "" : `${formatNumber(region.voteGap)}표 차`,
    }));
  const electionSummaries = (Array.isArray(payload.elections) ? payload.elections : [])
    .filter((election) => election?.name)
    .map((election) => ({
      name: election.shortName ?? election.name,
      fullName: election.name,
      raceCount: Number(election.raceCount ?? 0),
      regionCount: Number(election.regionCount ?? election.regions?.length ?? 0),
    }));

  const national = payload.national ?? {};
  const leadSnippet = regionLeaders
    .slice(0, 4)
    .map((region) => `${region.shortName} ${region.leaderName} ${region.leaderRate}`)
    .join(", ");
  const description = [
    `2026 지방선거 실시간 개표율: ${modifiedKst} 기준 평균 개표율 ${formatRate(national.averageCountingRate)}, ${formatNumber(national.reportingRegions)}개 시도 집계.`,
    leadSnippet ? `${leadSnippet} 등 지역별 후보 우세율과 SBS·MBC·TV조선 개표방송을 확인하세요.` : "지역별 후보 우세율과 주요 개표방송을 확인하세요.",
  ].join(" ");

  return {
    modifiedIso,
    modifiedKst,
    title: "2026 지방선거 실시간 개표율 | 지역별 후보 우세율·개표방송",
    description,
    averageCountingRate: formatRate(national.averageCountingRate),
    reportingRegions: formatNumber(national.reportingRegions),
    regionCount: formatNumber(national.regionCount ?? regions.length),
    totalVotes: formatNumber(national.totalVotes),
    validVotes: formatNumber(national.validVotes),
    regionLeaders,
    electionSummaries,
    statusText: statusText(payload.status),
  };
}

function updateIndex(html, payload, page) {
  let next = html;
  next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  next = replaceMetaName(next, "description", page.description);
  next = replaceMetaName(
    next,
    "keywords",
    "지방선거 실시간 개표, 2026 지방선거 개표율, 제9회 전국동시지방선거, 선거 개표방송, 지역별 후보 우세율, 시도지사 개표율, 구시군장 개표율, 교육감 개표율, 지방의원 개표율, 개표 현황",
  );
  next = replaceOrInsertMetaProperty(next, "og:title", page.title);
  next = replaceOrInsertMetaProperty(next, "og:description", page.description);
  next = replaceOrInsertMetaProperty(next, "og:image", OG_IMAGE_URL);
  next = replaceOrInsertMetaProperty(next, "og:image:width", "1200");
  next = replaceOrInsertMetaProperty(next, "og:image:height", "630");
  next = replaceOrInsertMetaProperty(next, "og:image:type", "image/png");
  next = replaceOrInsertMetaName(next, "twitter:card", "summary_large_image");
  next = replaceOrInsertMetaName(next, "twitter:title", page.title);
  next = replaceOrInsertMetaName(next, "twitter:description", page.description);
  next = replaceOrInsertMetaName(next, "twitter:image", OG_IMAGE_URL);
  next = replaceOrInsertLink(next, "icon", "./assets/app-icon.svg", 'type="image/svg+xml"');
  next = replaceOrInsertLink(next, "apple-touch-icon", "./assets/app-icon-192.png");
  next = replaceJsonLd(next, buildStructuredData(payload, page));
  next = replaceFallback(next, buildFallbackHtml(page));
  next = normalizeHeadOrder(next);
  return next;
}

function buildStructuredData(payload, page) {
  const itemList = page.regionLeaders.map((region, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: `${region.cityName} 개표율 ${region.countingRate}`,
    item: {
      "@type": "Thing",
      name: `${region.cityName} ${region.leaderName}`,
      description: `${region.cityName} 개표율 ${region.countingRate}, ${region.leaderParty ? `${region.leaderParty} ` : ""}${region.leaderName} ${region.leaderRate}`,
    },
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        name: "지방선거 실시간 개표 허브",
        alternateName: ["2026 지방선거 개표율", "전국동시지방선거 개표 상황"],
        url: SITE_URL,
        inLanguage: "ko-KR",
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}#webpage`,
        url: SITE_URL,
        name: page.title,
        description: page.description,
        isPartOf: { "@id": `${SITE_URL}#website` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: OG_IMAGE_URL,
          width: 1200,
          height: 630,
        },
        about: {
          "@type": "Event",
          name: "제9회 전국동시지방선거",
          startDate: "2026-06-03",
          eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          location: {
            "@type": "VirtualLocation",
            url: SITE_URL,
          },
        },
        mainEntity: { "@id": `${SITE_URL}#regional-results` },
        inLanguage: "ko-KR",
        datePublished: "2026-06-03",
        dateModified: page.modifiedIso,
      },
      {
        "@type": "Dataset",
        "@id": `${SITE_URL}#latest-results`,
        name: "2026 지방선거 실시간 개표 데이터",
        description: page.description,
        url: `${SITE_URL}data/latest.json`,
        dateModified: page.modifiedIso,
        inLanguage: "ko-KR",
        isBasedOn: payload.source?.endpoint ?? "https://info.nec.go.kr/",
      },
      {
        "@type": "ItemList",
        "@id": `${SITE_URL}#regional-results`,
        name: "지역별 지방선거 개표 우세 후보",
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: itemList.length,
        itemListElement: itemList,
      },
    ],
  };
}

function buildFallbackHtml(page) {
  const electionItems = page.electionSummaries
    .map(
      (election) => `
          <li>
            <strong>${escapeHtml(election.name)}</strong>
            <span>${escapeHtml(formatNumber(election.raceCount))}개 선거구 · ${escapeHtml(formatNumber(election.regionCount))}개 지역</span>
          </li>`,
    )
    .join("");
  const regionItems = page.regionLeaders
    .map(
      (region) => `
          <li>
            <strong>${escapeHtml(region.cityName)}</strong>
            <span>개표율 ${escapeHtml(region.countingRate)} · ${escapeHtml(region.leaderParty ? `${region.leaderParty} ` : "")}${escapeHtml(region.leaderName)} ${escapeHtml(region.leaderRate)}${region.voteGap ? ` · ${escapeHtml(region.voteGap)}` : ""}</span>
          </li>`,
    )
    .join("");

  return `
      ${SEO_START}
      <main class="seo-shell" data-static-seo>
        <p class="seo-kicker">2026.06.03 제9회 전국동시지방선거</p>
        <h1>2026 지방선거 실시간 개표율</h1>
        <p class="seo-lead">${escapeHtml(page.description)}</p>
        <section class="seo-summary" aria-labelledby="seo-summary-title">
          <h2 id="seo-summary-title">전국 개표 요약</h2>
          <dl class="seo-metrics">
            <div><dt>데이터 기준</dt><dd>${escapeHtml(page.modifiedKst)}</dd></div>
            <div><dt>상태</dt><dd>${escapeHtml(page.statusText)}</dd></div>
            <div><dt>평균 개표율</dt><dd>${escapeHtml(page.averageCountingRate)}</dd></div>
            <div><dt>집계 지역</dt><dd>${escapeHtml(page.reportingRegions)} / ${escapeHtml(page.regionCount)}</dd></div>
            <div><dt>투표수</dt><dd>${escapeHtml(page.totalVotes)}표</dd></div>
            <div><dt>유효표</dt><dd>${escapeHtml(page.validVotes)}표</dd></div>
          </dl>
        </section>
        <section class="seo-summary" aria-labelledby="seo-election-title">
          <h2 id="seo-election-title">선거종류별 집계 범위</h2>
          <ul class="seo-list compact">${electionItems}</ul>
        </section>
        <section class="seo-summary" aria-labelledby="seo-region-title">
          <h2 id="seo-region-title">지역별 후보 우세율</h2>
          <ol class="seo-list">${regionItems}</ol>
        </section>
        <p class="seo-official">
          공식 원문은 <a href="https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&amp;topMenuId=VC&amp;secondMenuId=VCCP09">중앙선거관리위원회 개표진행상황</a>에서 확인할 수 있습니다.
        </p>
      </main>
      ${SEO_END}`;
}

function replaceFallback(html, fallback) {
  if (html.includes(SEO_START) && html.includes(SEO_END)) {
    return html.replace(new RegExp(`${escapeRegExp(SEO_START)}[\\s\\S]*?${escapeRegExp(SEO_END)}`), fallback.trim());
  }
  return html.replace(/<div id="root"><\/div>/, `<div id="root">${fallback}\n    </div>`);
}

function replaceJsonLd(html, data) {
  const json = JSON.stringify(data, null, 8)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `      ${line}`))
    .join("\n");
  return html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/i,
    `<script type="application/ld+json">\n      ${json}\n    </script>`,
  );
}

function replaceMetaName(html, name, content) {
  return html.replace(new RegExp(`<meta\\s+name="${escapeRegExp(name)}"[\\s\\S]*?\\/?>`, "i"), metaNameTag(name, content));
}

function replaceOrInsertMetaName(html, name, content) {
  const pattern = new RegExp(`<meta\\s+name="${escapeRegExp(name)}"[\\s\\S]*?\\/?>`, "i");
  if (pattern.test(html)) return html.replace(pattern, metaNameTag(name, content));
  return html.replace("</head>", `    ${metaNameTag(name, content)}\n  </head>`);
}

function replaceOrInsertMetaProperty(html, property, content) {
  const pattern = new RegExp(`<meta\\s+property="${escapeRegExp(property)}"[\\s\\S]*?\\/?>`, "i");
  const tag = `<meta property="${property}" content="${escapeAttr(content)}" />`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function replaceOrInsertLink(html, rel, href, extra = "") {
  const pattern = new RegExp(`<link\\s+rel="${escapeRegExp(rel)}"[\\s\\S]*?\\/?>`, "i");
  const extraText = extra ? ` ${extra}` : "";
  const tag = `<link rel="${rel}" href="${escapeAttr(href)}"${extraText} />`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function normalizeHeadOrder(html) {
  let next = html;
  next = moveTagAfter(next, "meta", "property", "og:image", /<meta property="og:url"[\s\S]*?\/>/i);
  next = moveTagAfter(next, "meta", "property", "og:image:width", /<meta property="og:image"[\s\S]*?\/>/i);
  next = moveTagAfter(next, "meta", "property", "og:image:height", /<meta property="og:image:width"[\s\S]*?\/>/i);
  next = moveTagAfter(next, "meta", "property", "og:image:type", /<meta property="og:image:height"[\s\S]*?\/>/i);
  next = moveTagAfter(next, "meta", "name", "twitter:image", /<meta name="twitter:description"[\s\S]*?\/>/i);
  next = moveTagAfter(next, "link", "rel", "apple-touch-icon", /<link rel="manifest"[\s\S]*?\/>/i);
  return next;
}

function moveTagAfter(html, tagName, attrName, attrValue, afterPattern) {
  const tagPattern = new RegExp(`\\n?\\s*<${tagName}\\s+${attrName}="${escapeRegExp(attrValue)}"[\\s\\S]*?\\/?>`, "i");
  const match = html.match(tagPattern);
  if (!match) return html;
  const tag = match[0].trim();
  const withoutTag = html.replace(tagPattern, "");
  return withoutTag.replace(afterPattern, (anchor) => `${anchor}\n    ${tag}`);
}

function metaNameTag(name, content) {
  return `<meta name="${name}" content="${escapeAttr(content)}" />`;
}

function buildSitemap(lastModified) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${lastModified}</lastmod>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatKstDateTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatRate(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function statusText(status) {
  if (status === "ok") return "공식 데이터 반영";
  if (status === "fixture") return "검증 데이터";
  if (status === "error") return "공식 데이터 연결 실패";
  if (status === "empty") return "공식 데이터 대기";
  return "데이터 갱신 중";
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
