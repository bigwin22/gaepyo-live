#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const NEC_ENDPOINT = "https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml";
const ELECTION_ID = "0020260603";
const REQUEST_URI = `/electioninfo/${ELECTION_ID}/vc/vccp09.jsp`;

const CITY_CODES = [
  { code: "1100", name: "서울특별시", shortName: "서울" },
  { code: "2600", name: "부산광역시", shortName: "부산" },
  { code: "2700", name: "대구광역시", shortName: "대구" },
  { code: "2800", name: "인천광역시", shortName: "인천" },
  { code: "2900", name: "광주광역시", shortName: "광주" },
  { code: "3000", name: "대전광역시", shortName: "대전" },
  { code: "3100", name: "울산광역시", shortName: "울산" },
  { code: "5100", name: "세종특별자치시", shortName: "세종" },
  { code: "4100", name: "경기도", shortName: "경기" },
  { code: "5200", name: "강원특별자치도", shortName: "강원" },
  { code: "4300", name: "충청북도", shortName: "충북" },
  { code: "4400", name: "충청남도", shortName: "충남" },
  { code: "5300", name: "전북특별자치도", shortName: "전북" },
  { code: "4600", name: "전라남도", shortName: "전남" },
  { code: "4700", name: "경상북도", shortName: "경북" },
  { code: "4800", name: "경상남도", shortName: "경남" },
  { code: "4900", name: "제주특별자치도", shortName: "제주" },
];

const ELECTION_TYPES = [
  { code: "3", name: "시·도지사선거", statementId: "VCCP09_#3", primary: true },
  { code: "11", name: "교육감선거", statementId: "VCCP09_#11", primary: false },
];

const args = parseArgs(process.argv.slice(2));
const outputPath = args.out ?? "data/latest.json";
const generatedAt = new Date().toISOString();
const sourceNote =
  "중앙선거관리위원회 선거통계시스템 electionInfo_report.xhtml VCCP09 POST 응답을 파싱한 준실시간 데이터";

try {
  const payload = args.fixture
    ? await buildFromFixture(args.fixture)
    : await buildFromNec();
  await writeJson(outputPath, payload);
  console.log(`Wrote ${outputPath}`);
} catch (error) {
  const fallback = buildErrorPayload(error);
  await writeJson(outputPath, fallback);
  console.error(error);
  process.exitCode = 1;
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === "--out") parsed.out = values[++i];
    else if (value === "--fixture") parsed.fixture = values[++i];
  }
  return parsed;
}

async function buildFromFixture(fixturePath) {
  const html = await readFile(fixturePath, "utf8");
  const race = parseVccp09(html, {
    cityCode: "fixture",
    cityName: "Fixture",
    electionCode: "3",
    electionName: "시·도지사선거",
  });

  return buildPayload({
    status: race ? "fixture" : "empty",
    regions: race ? [race] : [],
    errors: race ? [] : [`fixture에서 개표 표를 찾지 못했습니다: ${fixturePath}`],
  });
}

async function buildFromNec() {
  const regions = [];
  const educationRegions = [];
  const errors = [];

  for (const electionType of ELECTION_TYPES) {
    for (const city of CITY_CODES) {
      try {
        const html = await fetchVccp09(city.code, electionType);
        const race = parseVccp09(html, {
          cityCode: city.code,
          cityName: city.name,
          shortName: city.shortName,
          electionCode: electionType.code,
          electionName: electionType.name,
        });
        if (race) {
          if (electionType.primary) regions.push(race);
          else educationRegions.push(race);
        } else {
          errors.push(`${city.name} ${electionType.name}: 결과 표 없음`);
        }
      } catch (error) {
        errors.push(`${city.name} ${electionType.name}: ${error.message}`);
      }
    }
  }

  return buildPayload({
    status: regions.length > 0 ? "ok" : "empty",
    regions,
    educationRegions,
    errors,
  });
}

async function fetchVccp09(cityCode, electionType) {
  const body = new URLSearchParams({
    electionId: ELECTION_ID,
    requestURI: REQUEST_URI,
    topMenuId: "VC",
    secondMenuId: "VCCP09",
    menuId: "VCCP09",
    statementId: electionType.statementId,
    electionCode: electionType.code,
    cityCode,
    townCode: "-1",
    sggCityCode: "-1",
    sggTownCode: "-1",
  });

  const response = await fetch(NEC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "gaepyo-live/1.0 (+https://github.com/bigwin22/gaepyo-live)",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function parseVccp09(html, context) {
  const table = html.match(/<table[^>]*id=["']table01["'][\s\S]*?<\/table>/i)?.[0];
  if (!table || /검색된 결과가 없습니다/.test(table)) return null;

  const rows = extractRows(table);
  let candidateRow = null;

  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index];
    if (isCandidateRow(cells)) {
      candidateRow = cells;
      continue;
    }

    if (!candidateRow || !isResultRow(cells)) continue;

    const rateRow = rows[index + 1] ?? [];
    const parsed = buildRaceFromRows(candidateRow, cells, rateRow, context);
    if (parsed && (cells[0] === "합계" || parsed.countingRate > 0 || parsed.totalVotes > 0)) {
      return parsed;
    }
  }

  return null;
}

function extractRows(tableHtml) {
  return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
        cleanCell(cellMatch[1]),
      ),
    )
    .filter((cells) => cells.length > 0);
}

function cleanCell(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\uFEFF/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t\r\f\v]+/g, " ")
      .trim(),
  );
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function isCandidateRow(cells) {
  return cells.some((cell) => cell.includes("\n")) && cells.includes("계");
}

function isResultRow(cells) {
  return cells.length >= 7 && cells[0] !== "" && cells[0] !== " ";
}

function buildRaceFromRows(candidateRow, resultRow, rateRow, context) {
  const candidateCells = candidateRow.slice(3).filter((cell) => cell && cell !== "계");
  if (candidateCells.length === 0) return null;

  const candidates = candidateCells.map((cell, offset) => {
    const [partyRaw = "", nameRaw = ""] = cell.split("\n");
    const votes = toNumber(resultRow[3 + offset]);
    const rate = toNumber(rateRow[3 + offset]);
    return {
      rank: 0,
      party: partyRaw.trim() || "무소속/기타",
      name: nameRaw.trim() || partyRaw.trim(),
      votes,
      rate,
    };
  });

  const sortedCandidates = candidates
    .filter((candidate) => candidate.name && candidate.name !== "|")
    .sort((a, b) => b.votes - a.votes || b.rate - a.rate)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  const leader = sortedCandidates[0] ?? null;
  const runnerUp = sortedCandidates[1] ?? null;
  const voteGap = leader && runnerUp ? leader.votes - runnerUp.votes : null;
  const rateGap = leader && runnerUp ? round2(leader.rate - runnerUp.rate) : null;

  return {
    cityCode: context.cityCode,
    cityName: context.cityName,
    shortName: context.shortName ?? context.cityName,
    electionCode: context.electionCode,
    electionName: context.electionName,
    unitName: resultRow[0],
    electorateCounted: toNumber(resultRow[1]),
    totalVotes: toNumber(resultRow[2]),
    validVotes: toNumber(resultRow[3 + candidateCells.length]),
    invalidVotes: toNumber(resultRow[4 + candidateCells.length]),
    abstentions: toNumber(resultRow[5 + candidateCells.length]),
    countingRate: toNumber(resultRow[6 + candidateCells.length]),
    leader,
    runnerUp,
    voteGap,
    rateGap,
    candidates: sortedCandidates,
  };
}

function buildPayload({ status, regions, educationRegions = [], errors }) {
  const national = summarizeNational(regions);
  return {
    schemaVersion: 1,
    status,
    generatedAt,
    electionId: ELECTION_ID,
    source: {
      name: "중앙선거관리위원회 선거통계시스템",
      endpoint: NEC_ENDPOINT,
      method: "POST",
      menuId: "VCCP09",
      note: sourceNote,
      verified: status === "ok" || status === "fixture",
    },
    updatePolicy: {
      mode: "github-actions-scheduled",
      expectedIntervalMinutes: 5,
      limitation: "GitHub Actions schedule은 지연될 수 있어 초 단위 실시간을 보장하지 않습니다.",
    },
    national,
    regions,
    educationRegions,
    errors,
  };
}

function buildErrorPayload(error) {
  return buildPayload({
    status: "error",
    regions: [],
    errors: [error?.message ?? String(error)],
  });
}

function summarizeNational(regions) {
  const totals = regions.reduce(
    (acc, region) => {
      acc.totalVotes += region.totalVotes;
      acc.validVotes += region.validVotes;
      acc.invalidVotes += region.invalidVotes;
      acc.electorateCounted += region.electorateCounted;
      acc.countingRateSum += region.countingRate;
      acc.reportingRegions += region.countingRate > 0 || region.totalVotes > 0 ? 1 : 0;
      return acc;
    },
    {
      totalVotes: 0,
      validVotes: 0,
      invalidVotes: 0,
      electorateCounted: 0,
      countingRateSum: 0,
      reportingRegions: 0,
    },
  );

  return {
    regionCount: regions.length,
    reportingRegions: totals.reportingRegions,
    averageCountingRate: regions.length ? round2(totals.countingRateSum / regions.length) : 0,
    totalVotes: totals.totalVotes,
    validVotes: totals.validVotes,
    invalidVotes: totals.invalidVotes,
    electorateCounted: totals.electorateCounted,
  };
}

function toNumber(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
  if (!normalized) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
