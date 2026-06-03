#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const NEC_ENDPOINT = "https://info.nec.go.kr/electioninfo/electionInfo_report.xhtml";
const ELECTION_ID = "0020260603";
const REQUEST_URI = `/electioninfo/${ELECTION_ID}/vc/vccp09.jsp`;
const CANDIDATE_REQUEST_URI = `/electioninfo/${ELECTION_ID}/cp/cpri03.jsp`;
const PHOTO_CDN_BASE = "https://cdn.nec.go.kr/";

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
  { code: "3", name: "시·도지사선거", shortName: "시도지사", statementId: "VCCP09_#3", scope: "city", primary: true },
  { code: "4", name: "구·시·군의 장선거", shortName: "구시군장", statementId: "VCCP09_#4", scope: "city" },
  { code: "5", name: "시·도의회의원선거", shortName: "시도의원", statementId: "VCCP09_#5_0", scope: "town" },
  { code: "6", name: "구·시·군의회의원선거", shortName: "구시군의원", statementId: "VCCP09_#6_0", scope: "town" },
  { code: "8", name: "광역의원비례대표선거", shortName: "광역비례", statementId: "VCCP09_#8", scope: "city" },
  { code: "9", name: "기초의원비례대표선거", shortName: "기초비례", statementId: "VCCP09_#9", scope: "city" },
  { code: "11", name: "교육감선거", shortName: "교육감", statementId: "VCCP09_#11", scope: "city" },
  { code: "2", name: "국회의원선거", shortName: "국회의원", statementId: "VCCP09_#2", scope: "sggCity" },
];

const CONCURRENCY_LIMIT = 8;

let generatedAt = new Date().toISOString();
let runtimeOptions = {
  outputPath: "data/latest.json",
  withPhotos: false,
};
const sourceNote =
  "중앙선거관리위원회 선거통계시스템 electionInfo_report.xhtml VCCP09 POST 응답을 파싱한 준실시간 데이터";

export async function buildLatestPayload(options = {}) {
  generatedAt = new Date().toISOString();
  runtimeOptions = {
    outputPath: options.outputPath ?? options.photoCachePath ?? "data/latest.json",
    withPhotos: Boolean(options.withPhotos),
  };
  return options.fixture ? buildFromFixture(options.fixture) : buildFromNec();
}

if (isCliEntry()) {
  await main();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.out ?? "data/latest.json";
  try {
    const payload = await buildLatestPayload({
      fixture: args.fixture,
      outputPath,
      withPhotos: args.withPhotos,
    });
    await writeJson(outputPath, payload);
    console.log(`Wrote ${outputPath}`);
  } catch (error) {
    const fallback = buildErrorPayload(error);
    await writeJson(outputPath, fallback);
    console.error(error);
    process.exitCode = 1;
  }
}

function isCliEntry() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function parseArgs(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === "--out") parsed.out = values[++i];
    else if (value === "--fixture") parsed.fixture = values[++i];
    else if (value === "--with-photos") parsed.withPhotos = true;
  }
  return parsed;
}

async function buildFromFixture(fixturePath) {
  const html = await readFile(fixturePath, "utf8");
  const races = parseVccp09Races(html, {
    cityCode: "fixture",
    cityName: "Fixture",
    electionCode: "3",
    electionName: "시·도지사선거",
    electionShortName: "시도지사",
    areaCode: "fixture",
    areaName: "Fixture",
  });

  return buildPayload({
    status: races.length ? "fixture" : "empty",
    regions: races.length ? [races[0]] : [],
    errors: races.length ? [] : [`fixture에서 개표 표를 찾지 못했습니다: ${fixturePath}`],
  });
}

async function buildFromNec() {
  const elections = [];
  const errors = [];
  const warnings = [];
  const photoCache = runtimeOptions.withPhotos ? new Map() : await readPhotoCache(runtimeOptions.outputPath);

  for (const electionType of ELECTION_TYPES) {
    const election = await collectElection(electionType, errors, warnings, photoCache);
    elections.push(election);
  }

  const regions = getSummaryRegions(elections, "3");
  const educationRegions = getSummaryRegions(elections, "11");

  return buildPayload({
    status: regions.length > 0 ? "ok" : "empty",
    regions,
    educationRegions,
    elections,
    errors,
    warnings,
  });
}

async function collectElection(electionType, errors, warnings, photoCache) {
  const tasks = await buildFetchTasks(electionType);
  const results = await mapLimit(tasks, CONCURRENCY_LIMIT, async (task) => {
    try {
      const html = await fetchVccp09(task, electionType);
      const races = parseVccp09Races(html, {
        cityCode: task.city.code,
        cityName: task.city.name,
        shortName: task.city.shortName,
        electionCode: electionType.code,
        electionName: electionType.name,
        electionShortName: electionType.shortName,
        areaCode: task.areaCode,
        areaName: task.areaName,
      });
      return { task, races };
    } catch (error) {
      const message = `${task.city.name} ${task.areaName ? `${task.areaName} ` : ""}${electionType.name}: ${error.message}`;
      if (electionType.primary) errors.push(message);
      else warnings.push(message);
      return { task, races: [] };
    }
  });

  const regionMap = new Map();
  for (const { task, races } of results) {
    if (!races.length) continue;
    const existing = regionMap.get(task.city.code) ?? {
      cityCode: task.city.code,
      cityName: task.city.name,
      shortName: task.city.shortName,
      races: [],
    };
    existing.races.push(...races);
    regionMap.set(task.city.code, existing);
  }

  let regions = CITY_CODES.map((city) => regionMap.get(city.code)).filter(Boolean);

  if (electionType.primary && runtimeOptions.withPhotos) {
    const photoEntries = await mapLimit(regions, CONCURRENCY_LIMIT, async (region) => {
      try {
        return [region.cityCode, await fetchCandidatePhotos(region.cityCode, electionType)];
      } catch (error) {
        warnings.push(`${region.cityName} 후보 사진: ${error.message}`);
        return [region.cityCode, new Map()];
      }
    });
    const photoMapByCity = new Map(photoEntries);
    regions = regions.map((region) => {
      const photoMap = photoMapByCity.get(region.cityCode) ?? new Map();
      return {
        ...region,
        races: region.races.map((race) => attachCandidatePhotos(race, photoMap)),
      };
    });
  } else if (electionType.primary && photoCache.size) {
    regions = regions.map((region) => {
      const photoMap = photoCache.get(region.cityCode) ?? new Map();
      return {
        ...region,
        races: region.races.map((race) => attachCandidatePhotos(race, photoMap)),
      };
    });
  }

  return {
    code: electionType.code,
    name: electionType.name,
    shortName: electionType.shortName,
    scope: electionType.scope,
    regionCount: regions.length,
    raceCount: regions.reduce((sum, region) => sum + region.races.length, 0),
    regions,
  };
}

async function buildFetchTasks(electionType) {
  if (electionType.scope === "town") {
    const townGroups = await mapLimit(CITY_CODES, CONCURRENCY_LIMIT, async (city) => {
      const towns = await fetchTownCodes(city, electionType);
      return towns.map((town) => ({
        city,
        areaCode: town.code,
        areaName: town.name,
        townCode: town.code,
        sggCityCode: "-1",
        sggTownCode: "-1",
      }));
    });
    return townGroups.flat();
  }

  if (electionType.scope === "sggCity") {
    const sggGroups = await mapLimit(CITY_CODES, CONCURRENCY_LIMIT, async (city) => {
      const districts = await fetchSggCityCodes(city, electionType);
      return districts.map((district) => ({
        city,
        areaCode: district.code,
        areaName: district.name,
        townCode: "-1",
        sggCityCode: district.code,
        sggTownCode: "-1",
      }));
    });
    return sggGroups.flat();
  }

  return CITY_CODES.map((city) => ({
    city,
    areaCode: city.code,
    areaName: city.name,
    townCode: "-1",
    sggCityCode: "-1",
    sggTownCode: "-1",
  }));
}

async function fetchVccp09(task, electionType) {
  const body = new URLSearchParams({
    electionId: ELECTION_ID,
    requestURI: REQUEST_URI,
    topMenuId: "VC",
    secondMenuId: "VCCP09",
    menuId: "VCCP09",
    statementId: electionType.statementId,
    electionCode: electionType.code,
    cityCode: task.city.code,
    townCode: task.townCode,
    sggCityCode: task.sggCityCode,
    sggTownCode: task.sggTownCode,
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

async function fetchCandidatePhotos(cityCode, electionType) {
  const body = new URLSearchParams({
    electionId: ELECTION_ID,
    requestURI: CANDIDATE_REQUEST_URI,
    topMenuId: "CP",
    secondMenuId: "CPRI03",
    menuId: "CPRI03",
    statementId: `CPRI03_#${electionType.code}`,
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

  return parseCandidatePhotos(await response.text());
}

async function fetchTownCodes(city, electionType) {
  const path =
    electionType.code === "5"
      ? "/bizcommon/selectbox/selectbox_townCodeByCityIntgSgJson.json"
      : "/bizcommon/selectbox/selectbox_townCodeBySgJson.json";
  const rows = await fetchSelectbox(path, {
    electionId: ELECTION_ID,
    electionCode: electionType.code,
    cityCode: city.code,
  });
  return rows.map((row) => ({ code: row.CODE, name: row.NAME })).filter((row) => Number(row.code) > 0);
}

async function fetchSggCityCodes(city, electionType) {
  const rows = await fetchSelectbox("/bizcommon/selectbox/selectbox_getSggCityCodeJson.json", {
    electionId: ELECTION_ID,
    electionCode: electionType.code,
    cityCode: city.code,
  });
  return rows.map((row) => ({ code: row.CODE, name: row.NAME })).filter((row) => Number(row.code) > 0);
}

async function fetchSelectbox(path, params) {
  const url = `https://info.nec.go.kr${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "gaepyo-live/1.0 (+https://github.com/bigwin22/gaepyo-live)",
    },
  });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  const payload = await response.json();
  return payload?.jsonResult?.body ?? [];
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseVccp09Races(html, context) {
  const table = html.match(/<table[^>]*id=["']table01["'][\s\S]*?<\/table>/i)?.[0];
  if (!table || /검색된 결과가 없습니다/.test(table)) return [];

  const rows = extractRows(table);
  let candidateRow = null;
  const races = [];

  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index];
    if (isCandidateRow(cells)) {
      candidateRow = cells;
      continue;
    }

    if (!candidateRow || !isResultRow(cells)) continue;

    const rateRow = rows[index + 1] ?? [];
    const parsed = buildRaceFromRows(candidateRow, cells, rateRow, context);
    if (parsed) {
      races.push(parsed);
      index += 1;
    }
  }

  return races;
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

function parseCandidatePhotos(html) {
  const table = html.match(/<table[^>]*id=["']table01["'][\s\S]*?<\/table>/i)?.[0];
  if (!table || /검색된 결과가 없습니다/.test(table)) return new Map();

  const photos = new Map();
  for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    const thumbnailUrl = rowHtml.match(/<input[^>]+type=["']image["'][^>]+src=["']([^"']+)["']/i)?.[1];
    if (!thumbnailUrl) continue;

    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cellMatch) => cellMatch[1]);
    if (cells.length < 5) continue;

    const party = cleanCell(cells[3]);
    const name = cleanCandidateName(cleanCell(cells[4]));
    if (!name) continue;

    const candidateId = rowHtml.match(/popupHBJ\(['"][^'"]+['"],\s*['"]([^'"]+)['"]\)/i)?.[1] ?? "";
    const photoPath = rowHtml.match(/winPhotoPopup\(['"]([^'"]+)['"]\)/i)?.[1] ?? "";

    photos.set(candidateKey(name, party), {
      candidateId,
      photoUrl: toPhotoUrl(photoPath || thumbnailUrl),
      photoThumbnailUrl: toPhotoUrl(thumbnailUrl),
    });
  }

  return photos;
}

async function readPhotoCache(path) {
  const cache = new Map();
  try {
    const payload = JSON.parse(await readFile(path, "utf8"));
    const races = [
      ...(payload.regions ?? []),
      ...(payload.elections ?? []).flatMap((election) =>
        (election.regions ?? []).flatMap((region) => region.races ?? []),
      ),
    ];

    for (const race of races) {
      const cityCode = race.cityCode;
      if (!cityCode) continue;
      const cityCache = cache.get(cityCode) ?? new Map();

      for (const candidate of race.candidates ?? []) {
        const photoUrl = candidatePhotoUrl(candidate);
        const photoThumbnailUrl = candidate.photoThumbnailUrl ?? "";
        if (!photoUrl && !photoThumbnailUrl) continue;
        cityCache.set(candidateKey(candidate.name, candidate.party), {
          photoUrl,
          photoThumbnailUrl,
        });
      }

      if (cityCache.size) cache.set(cityCode, cityCache);
    }
  } catch {
    return cache;
  }
  return cache;
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

function candidatePhotoUrl(candidate) {
  return candidate.photoUrl ?? candidate.photoThumbnailUrl ?? candidate.imageUrl ?? candidate.profileImage ?? "";
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
  return cells.includes("계") && cells.some((cell) => cell && !isNumericCell(cell));
}

function isResultRow(cells) {
  return cells.length >= 7 && cells.some(isNumericCell);
}

function buildRaceFromRows(candidateRow, resultRow, rateRow, context) {
  const totalIndex = candidateRow.findIndex((cell) => cell === "계");
  if (totalIndex < 0) return null;

  const candidateIndexes = candidateRow
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell, index }) => {
      if (!cell || index >= totalIndex) return false;
      return isNumericCell(resultRow[index]) && isNumericCell(rateRow[index]);
    });

  if (candidateIndexes.length === 0) return null;

  const candidates = candidateIndexes.map(({ cell, index }) => {
    const [partyRaw = "", nameRaw = ""] = cell.split("\n");
    const votes = toNumber(resultRow[index]);
    const rate = toNumber(rateRow[index]);
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
  const electorateIndex = Math.max(0, candidateIndexes[0].index - 2);
  const totalVotesIndex = Math.max(0, candidateIndexes[0].index - 1);
  const unitName = buildUnitName(candidateRow, resultRow, electorateIndex, context);
  const raceKey = `${context.electionCode}:${context.cityCode}:${context.areaCode}:${unitName}`;

  return {
    raceKey,
    cityCode: context.cityCode,
    cityName: context.cityName,
    shortName: context.shortName ?? context.cityName,
    areaCode: context.areaCode,
    areaName: context.areaName,
    electionCode: context.electionCode,
    electionName: context.electionName,
    electionShortName: context.electionShortName,
    unitName,
    electorateCounted: toNumber(resultRow[electorateIndex]),
    totalVotes: toNumber(resultRow[totalVotesIndex]),
    validVotes: toNumber(resultRow[totalIndex]),
    invalidVotes: toNumber(resultRow[totalIndex + 1]),
    abstentions: toNumber(resultRow[totalIndex + 2]),
    countingRate: toNumber(resultRow[totalIndex + 3]),
    leader,
    runnerUp,
    voteGap,
    rateGap,
    candidates: sortedCandidates,
  };
}

function attachCandidatePhotos(race, photoMap) {
  if (!photoMap.size) return race;

  const candidates = race.candidates.map((candidate) => ({
    ...candidate,
    ...(photoMap.get(candidateKey(candidate.name, candidate.party)) ?? {}),
  }));

  return {
    ...race,
    candidates,
    leader: candidates[0] ?? race.leader,
    runnerUp: candidates[1] ?? race.runnerUp,
  };
}

function buildUnitName(candidateRow, resultRow, electorateIndex, context) {
  const resultName = resultRow.slice(0, electorateIndex).filter(Boolean).join(" ");
  if (resultName) return resultName.replace(/\s+/g, " ").trim();
  const candidateName = candidateRow.slice(0, electorateIndex).filter(Boolean).join(" ");
  if (candidateName) return candidateName.replace(/\s+/g, " ").trim();
  return context.areaName || context.cityName;
}

function getSummaryRegions(elections, code) {
  const election = elections.find((item) => item.code === code);
  if (!election) return [];
  return election.regions
    .map((region) => {
      const summaryRace =
        region.races.find((race) => race.unitName === "합계") ??
        region.races.find((race) => race.totalVotes > 0 || race.countingRate > 0) ??
        region.races[0];
      return summaryRace ? { ...summaryRace } : null;
    })
    .filter(Boolean);
}

function buildPayload({ status, regions, educationRegions = [], elections = [], errors, warnings = [] }) {
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
      expectedIntervalMinutes: 1,
      limitation: "GitHub Actions schedule은 지연될 수 있어 초 단위 실시간을 보장하지 않습니다.",
    },
    national,
    regions,
    educationRegions,
    elections,
    errors,
    warnings,
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

function isNumericCell(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
  if (!normalized) return false;
  return Number.isFinite(Number(normalized));
}

function cleanCandidateName(value) {
  return String(value ?? "")
    .split("\n")[0]
    .replace(/\(.+$/, "")
    .trim();
}

function candidateKey(name, party) {
  return `${normalizeKey(name)}|${normalizeKey(party)}`;
}

function normalizeKey(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function toPhotoUrl(value) {
  const normalized = decodeEntities(String(value ?? "").trim());
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) return normalized.replace(/^http:\/\//i, "https://");
  return `${PHOTO_CDN_BASE}${normalized.replace(/^\/+/, "")}`;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
