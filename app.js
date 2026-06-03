import React, { memo, useCallback, useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { Analytics } from "https://esm.sh/@vercel/analytics@2.0.1/react?deps=react@18.3.1";
import { SpeedInsights } from "https://esm.sh/@vercel/speed-insights@2.0.0/react?deps=react@18.3.1";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);

const broadcasts = [
  {
    name: "SBS News",
    description: "SBS 개표방송",
    videoId: "qdSrfJWkPlM",
    url: "https://www.youtube.com/watch?v=qdSrfJWkPlM",
  },
  {
    name: "MBC News",
    description: "MBC 개표방송",
    videoId: "SPDq9vB0pYs",
    url: "https://www.youtube.com/watch?v=SPDq9vB0pYs",
  },
  {
    name: "TV조선",
    description: "TV조선 개표방송",
    videoId: "EeDftZ8E244",
    url: "https://www.youtube.com/watch?v=EeDftZ8E244",
  },
];

const fallbackRegions = [
  { cityCode: "1100", cityName: "서울특별시", shortName: "서울" },
  { cityCode: "2600", cityName: "부산광역시", shortName: "부산" },
  { cityCode: "2700", cityName: "대구광역시", shortName: "대구" },
  { cityCode: "2800", cityName: "인천광역시", shortName: "인천" },
  { cityCode: "2900", cityName: "광주광역시", shortName: "광주" },
  { cityCode: "3000", cityName: "대전광역시", shortName: "대전" },
  { cityCode: "3100", cityName: "울산광역시", shortName: "울산" },
  { cityCode: "5100", cityName: "세종특별자치시", shortName: "세종" },
  { cityCode: "4100", cityName: "경기도", shortName: "경기" },
  { cityCode: "5200", cityName: "강원특별자치도", shortName: "강원" },
  { cityCode: "4300", cityName: "충청북도", shortName: "충북" },
  { cityCode: "4400", cityName: "충청남도", shortName: "충남" },
  { cityCode: "5300", cityName: "전북특별자치도", shortName: "전북" },
  { cityCode: "4600", cityName: "전라남도", shortName: "전남" },
  { cityCode: "4700", cityName: "경상북도", shortName: "경북" },
  { cityCode: "4800", cityName: "경상남도", shortName: "경남" },
  { cityCode: "4900", cityName: "제주특별자치도", shortName: "제주" },
];

const AUTO_REFRESH_SECONDS = 60;
const ALL_RACES = "__all__";
const LIVE_ENDPOINT = "/api/latest";
const LIVE_REFRESH_ENDPOINT = "/api/latest?live=1";
const STATIC_ENDPOINT = "/data/latest.json";
const LOCAL_DATA_CACHE_KEY = "gaepyo-live:last-payload";
const DATA_CACHE_BUCKET_MS = 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 55000;
const koreanSorter = new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true });
const SITE_URL = "https://vote.gubiko.com";
const REGION_SLUGS = {
  "1100": "seoul",
  "2600": "busan",
  "2700": "daegu",
  "2800": "incheon",
  "2900": "gwangju",
  "3000": "daejeon",
  "3100": "ulsan",
  "5100": "sejong",
  "4100": "gyeonggi",
  "5200": "gangwon",
  "4300": "chungbuk",
  "4400": "chungnam",
  "5300": "jeonbuk",
  "4600": "jeonnam",
  "4700": "gyeongbuk",
  "4800": "gyeongnam",
  "4900": "jeju",
};
const ELECTION_SLUGS = {
  2: "assembly",
  3: "governor",
  4: "mayor",
  5: "province-council",
  6: "local-council",
  8: "province-pr",
  9: "local-pr",
  11: "education",
};
const REGION_CODES_BY_SLUG = invertRecord(REGION_SLUGS);
const ELECTION_CODES_BY_SLUG = invertRecord(ELECTION_SLUGS);

function App() {
  const [data, setData] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [selectedElectionCode, setSelectedElectionCode] = useState("3");
  const [selectedRaceKey, setSelectedRaceKey] = useState(ALL_RACES);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [refreshFeedbackUntil, setRefreshFeedbackUntil] = useState(0);
  const [routeRequest, setRouteRequest] = useState(() => parseRoute(window.location.pathname));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const showCachedPayload = (payload) => {
        setData(payload);
        setLoading(false);
      };
      setData(
        await fetchLatestData({
          onCachedPayload: showCachedPayload,
        }),
      );
    } catch (error) {
      setData({
        status: "error",
        generatedAt: new Date().toISOString(),
        national: {},
        regions: [],
        elections: [],
        errors: [error.message],
      });
    } finally {
      const checkedAt = new Date();
      setLastCheckedAt(checkedAt.toISOString());
      setRefreshFeedbackUntil(Date.now() + 4000);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, AUTO_REFRESH_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    if (!refreshFeedbackUntil) return undefined;
    const delay = Math.max(0, refreshFeedbackUntil - Date.now());
    const timer = window.setTimeout(() => setRefreshFeedbackUntil(0), delay);
    return () => window.clearTimeout(timer);
  }, [refreshFeedbackUntil]);

  const regions = useMemo(() => dataRegions(data), [data]);
  const elections = useMemo(() => dataElections(data), [data]);
  const normalizedFilter = useMemo(() => normalizeSearchText(filter), [filter]);

  useEffect(() => {
    if (!regions.length) return;
    if (routeRequest.regionCode && regions.some((region) => region.cityCode === routeRequest.regionCode)) {
      if (selectedCode !== routeRequest.regionCode) setSelectedCode(routeRequest.regionCode);
      return;
    }
    if (regions.some((region) => region.cityCode === selectedCode)) return;
    const firstReportingRegion = regions.find(hasRaceData);
    setSelectedCode((firstReportingRegion ?? regions[0])?.cityCode ?? null);
  }, [regions, routeRequest.regionCode, selectedCode]);

  const selectedRegion = useMemo(
    () => regions.find((region) => region.cityCode === selectedCode) ?? regions[0] ?? null,
    [regions, selectedCode],
  );

  const availableElections = useMemo(
    () =>
      elections
        .map((election) => ({
          election,
          region: election.regions?.find((region) => region.cityCode === selectedRegion?.cityCode),
        }))
        .filter(({ region }) => region?.races?.length > 0),
    [elections, selectedRegion],
  );

  useEffect(() => {
    if (!availableElections.length) return;
    if (routeRequest.electionCode && availableElections.some(({ election }) => election.code === routeRequest.electionCode)) {
      if (selectedElectionCode !== routeRequest.electionCode) setSelectedElectionCode(routeRequest.electionCode);
      return;
    }
    if (availableElections.some(({ election }) => election.code === selectedElectionCode)) return;
    const preferred = availableElections.find(({ election }) => election.code === "3") ?? availableElections[0];
    setSelectedElectionCode(preferred.election.code);
    setSelectedRaceKey(ALL_RACES);
  }, [availableElections, routeRequest.electionCode, selectedElectionCode]);

  const selectedElection = useMemo(
    () =>
      availableElections.find(({ election }) => election.code === selectedElectionCode)?.election ??
      availableElections[0]?.election ??
      null,
    [availableElections, selectedElectionCode],
  );

  const electionRegion = useMemo(
    () => selectedElection?.regions?.find((region) => region.cityCode === selectedRegion?.cityCode) ?? null,
    [selectedElection, selectedRegion],
  );

  const races = useMemo(
    () => (electionRegion?.races ?? []).filter((race) => !isSubtotalRace(race)),
    [electionRegion],
  );
  const matchingRaces = useMemo(() => {
    if (!normalizedFilter) return races;
    return races.filter((race) => matchesRaceSearch(race, normalizedFilter));
  }, [normalizedFilter, races]);

  useEffect(() => {
    if (routeRequest.raceSlug) {
      const routeRace = matchingRaces.find((race) => raceSlug(race) === routeRequest.raceSlug);
      if (routeRace && selectedRaceKey !== routeRace.raceKey) {
        setSelectedRaceKey(routeRace.raceKey);
        return;
      }
    }
    if (selectedRaceKey === ALL_RACES) return;
    if (matchingRaces.some((race) => race.raceKey === selectedRaceKey)) return;
    setSelectedRaceKey(ALL_RACES);
  }, [matchingRaces, routeRequest.raceSlug, selectedRaceKey]);

  const visibleRaces = useMemo(() => {
    if (selectedRaceKey === ALL_RACES) return matchingRaces;
    return matchingRaces.filter((race) => race.raceKey === selectedRaceKey);
  }, [matchingRaces, selectedRaceKey]);

  const chooseRace = useCallback(
    (raceKey) => {
      setSelectedRaceKey(raceKey);
      const selectedRace = matchingRaces.find((race) => race.raceKey === raceKey);
      setRouteRequest((current) => ({
        ...current,
        raceSlug: selectedRace ? raceSlug(selectedRace) : null,
      }));
    },
    [matchingRaces],
  );

  useEffect(() => {
    const onPopState = () => setRouteRequest(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!selectedRegion || !selectedElection) return;
    if (!hasRouteRequest(routeRequest)) return;
    const selectedRace = selectedRaceKey === ALL_RACES ? null : races.find((race) => race.raceKey === selectedRaceKey);
    replaceRouteForSelection(selectedRegion, selectedElection, selectedRace);
  }, [races, routeRequest, selectedElection, selectedRaceKey, selectedRegion]);

  useEffect(() => {
    const selectedRace = selectedRaceKey === ALL_RACES ? null : races.find((race) => race.raceKey === selectedRaceKey);
    updateRouteSeo({
      region: selectedRegion,
      election: selectedElection,
      race: selectedRace,
      national: data?.national,
      generatedAt: data?.generatedAt,
    });
  }, [data?.generatedAt, data?.national, races, selectedElection, selectedRaceKey, selectedRegion]);

  const chooseRegion = useCallback(
    (cityCode) => {
      setSelectedCode(cityCode);
      setSelectedRaceKey(ALL_RACES);
      setRouteRequest((current) => ({ ...current, regionCode: cityCode, raceSlug: null }));
      const region = regions.find((item) => item.cityCode === cityCode);
      const election =
        selectedElection ??
        availableElections.find(({ election: item }) => item.code === selectedElectionCode)?.election ?? { code: selectedElectionCode };
      if (region && election) replaceRouteForSelection(region, election, null);
    },
    [availableElections, regions, selectedElection, selectedElectionCode],
  );

  const chooseElection = useCallback(
    (electionCode) => {
      setSelectedElectionCode(electionCode);
      setSelectedRaceKey(ALL_RACES);
      setRouteRequest((current) => ({ ...current, electionCode, raceSlug: null }));
      const election = availableElections.find(({ election: item }) => item.code === electionCode)?.election;
      if (selectedRegion && election) replaceRouteForSelection(selectedRegion, election, null);
    },
    [availableElections, selectedRegion],
  );

  const submitSearch = useCallback(
    (event) => {
      event.preventDefault();
      const query = normalizeSearchText(filter);
      if (!query) return;
      const first = regions.find((region) => matchesRegionSearch(region, query));
      if (first) chooseRegion(first.cityCode);
    },
    [chooseRegion, filter, regions],
  );

  return html`
    <${Header} filter=${filter} setFilter=${setFilter} submitSearch=${submitSearch} />
    <main>
      <section aria-labelledby="live-title">
        <div className="section-title">
          <h2 id="live-title">언론사 실시간 방송</h2>
          <span>실시간 중계</span>
        </div>
        <${BroadcastTabs} />
      </section>

      <${ResultsSection}
        data=${data}
        regions=${regions}
        selectedRegion=${selectedRegion}
        selectedElection=${selectedElection}
        availableElections=${availableElections}
        races=${races}
        matchingRaces=${matchingRaces}
        visibleRaces=${visibleRaces}
        filter=${filter}
        setFilter=${setFilter}
        loading=${loading}
        lastCheckedAt=${lastCheckedAt}
        refreshFeedbackUntil=${refreshFeedbackUntil}
        selectedElectionCode=${selectedElectionCode}
        selectedRaceKey=${selectedRaceKey}
        chooseRegion=${chooseRegion}
        chooseElection=${chooseElection}
        chooseRace=${chooseRace}
        loadData=${loadData}
      />

      <${OfficialLinks} />
    </main>
    <${SiteFooter} />
    <${Analytics} />
    <${SpeedInsights} />
  `;
}

function Header({ filter, setFilter, submitSearch }) {
  return html`
    <header className="site-header">
      <form className="search" onSubmit=${submitSearch}>
        <label htmlFor="region-input">지역 검색</label>
        <div className="search-row">
          <input
            id="region-input"
            name="region"
            type="search"
            placeholder="예: 서울, 경기, 안산"
            value=${filter}
            onInput=${(event) => setFilter(event.currentTarget.value)}
          />
          <button type="submit">검색</button>
        </div>
      </form>
      <div>
        <p className="date">2026.06.03 제9회 전국동시지방선거</p>
        <h1>지방선거 실시간 개표 허브</h1>
      </div>
    </header>
  `;
}

const BroadcastTabs = memo(function BroadcastTabs() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeVideoId, setActiveVideoId] = useState(broadcasts[0]?.videoId ?? null);
  const activeBroadcast = broadcasts.find((broadcast) => broadcast.videoId === activeVideoId) ?? broadcasts[0];

  if (!activeBroadcast) return null;

  const playerParams = "autoplay=1&mute=1&playsinline=1&rel=0";
  const embedUrl = `https://www.youtube.com/embed/${activeBroadcast.videoId}?${playerParams}`;

  return html`
    <div className=${`broadcast-tabs${isOpen ? " open" : ""}`}>
      <button
        className="broadcast-disclosure"
        type="button"
        aria-expanded=${isOpen}
        aria-controls="broadcast-panel"
        onClick=${() => setIsOpen((current) => !current)}
      >
        <span>
          <strong>언론사 방송 보기</strong>
          <small>방송 목록은 시청 편의를 위해 제공되며, 특정 언론사나 정치적 입장을 지지하지 않습니다.</small>
        </span>
        <span className="broadcast-toggle-indicator" aria-hidden="true" />
      </button>

      ${isOpen &&
      html`
        <div className="broadcast-panel" id="broadcast-panel">
          <div className="broadcast-tablist" role="tablist" aria-label="언론사 방송 선택">
            ${broadcasts.map(
              (broadcast) => html`
                <button
                  className=${`broadcast-tab${broadcast.videoId === activeBroadcast.videoId ? " selected" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected=${broadcast.videoId === activeBroadcast.videoId}
                  aria-controls="broadcast-player"
                  onClick=${() => setActiveVideoId(broadcast.videoId)}
                  key=${broadcast.videoId}
                >
                  ${broadcast.name}
                </button>
              `,
            )}
          </div>

          <article className="broadcast-card" id="broadcast-player" role="tabpanel">
            <div className="broadcast-frame">
              <iframe
                title="${activeBroadcast.name} live"
                src=${embedUrl}
                loading="eager"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <div className="broadcast-meta">
              <h3>${activeBroadcast.name}</h3>
              <p className="muted">${activeBroadcast.description}</p>
              <a className="text-link" href=${activeBroadcast.url} target="_blank" rel="noreferrer">유튜브에서 보기</a>
            </div>
          </article>
        </div>
      `}
    </div>
  `;
});

function ResultsSection({
  data,
  regions,
  selectedRegion,
  selectedElection,
  availableElections,
  races,
  matchingRaces,
  visibleRaces,
  filter,
  setFilter,
  loading,
  lastCheckedAt,
  refreshFeedbackUntil,
  selectedElectionCode,
  selectedRaceKey,
  chooseRegion,
  chooseElection,
  chooseRace,
  loadData,
}) {
  const label = statusLabel(data);
  const showRefreshDone = !loading && Date.now() < refreshFeedbackUntil;

  return html`
    <section aria-labelledby="results-title">
      <div className="section-title">
        <h2 id="results-title">개표 상황</h2>
        <div className="status-row">
          <span className=${`status-pill ${label.className}`}>${label.text} · 자동 갱신 중</span>
          <span className="time-chip">공식 수집 ${formatGeneratedAt(data?.generatedAt)}</span>
          <span className="time-chip checked">마지막 확인 ${formatCheckedAt(lastCheckedAt)}</span>
          <button className="small-button" type="button" disabled=${loading} onClick=${loadData}>
            ${loading ? "갱신 중" : showRefreshDone ? "확인 완료" : "지금 갱신"}
          </button>
        </div>
      </div>
      <${NationalGrid} data=${data} regions=${regions} />
      <${SeatSharePanel} selectedElection=${selectedElection} />
      <div className="selection-bar">
        <${ElectionTabs}
          availableElections=${availableElections}
          selectedElectionCode=${selectedElectionCode}
          chooseElection=${chooseElection}
        />
        <${DetailSelector}
          selectedElection=${selectedElection}
          races=${matchingRaces}
          selectedRaceKey=${selectedRaceKey}
          chooseRace=${chooseRace}
        />
      </div>
      <div className="results-layout">
        <${RegionList}
          regions=${regions}
          selectedCode=${selectedRegion?.cityCode}
          filter=${filter}
          setFilter=${setFilter}
          chooseRegion=${chooseRegion}
        />
        <${RacePanel}
          selectedRegion=${selectedRegion}
          selectedElection=${selectedElection}
          races=${matchingRaces}
          visibleRaces=${visibleRaces}
          selectedRaceKey=${selectedRaceKey}
          filter=${filter}
        />
      </div>
    </section>
  `;
}

function NationalGrid({ data, regions }) {
  const national = data?.national ?? {};
  const errors = data?.errors ?? [];
  const items = [
    ["평균 개표율", formatRate(national.averageCountingRate)],
    ["집계 지역", `${formatNumber(national.reportingRegions)} / ${formatNumber(regions.length)}`],
    ["투표수", formatNumber(national.totalVotes)],
    ["유효표", formatNumber(national.validVotes)],
  ];

  return html`
    <div className="national-grid">
      ${items.map(
        ([label, value]) => html`
          <div className="metric" key=${label}>
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `,
      )}
      ${errors.length ? html`<p className="notice">${errors.slice(0, 2).join(" / ")}</p>` : null}
    </div>
  `;
}

function ElectionTabs({ availableElections, selectedElectionCode, chooseElection }) {
  if (!availableElections.length) return null;

  return html`
    <div className="election-tabs" aria-label="선거종류 선택">
      ${availableElections.map(({ election, region }) => html`
        <button
          className=${`election-tab${election.code === selectedElectionCode ? " selected" : ""}`}
          type="button"
          data-election=${election.code}
          key=${election.code}
          onClick=${() => chooseElection(election.code)}
        >
          <span>${election.shortName ?? election.name}</span>
          <strong>${formatNumber(region.races.length)}</strong>
        </button>
      `)}
    </div>
  `;
}

function DetailSelector({ selectedElection, races, selectedRaceKey, chooseRace }) {
  return html`
    <label className="detail-control">
      <span>세부 지역</span>
      <select
        value=${selectedRaceKey}
        disabled=${!races.length}
        onChange=${(event) => chooseRace(event.currentTarget.value)}
      >
        <option value=${ALL_RACES}>
          ${selectedElection?.shortName ?? "선거"} 전체 ${races.length ? `(${formatNumber(races.length)})` : ""}
        </option>
        ${races.map((race) => html`
          <option key=${race.raceKey} value=${race.raceKey}>
            ${race.unitName ?? race.areaName ?? race.cityName}
          </option>
        `)}
      </select>
    </label>
  `;
}

function RegionList({ regions, selectedCode, filter, setFilter, chooseRegion }) {
  const normalizedFilter = normalizeSearchText(filter);
  const visibleRegions = regions.filter((region) => matchesRegionSearch(region, normalizedFilter));

  return html`
    <aside className="region-list" aria-label="지역 선택">
      ${visibleRegions.map((region) => {
        const selected = region.cityCode === selectedCode ? " selected" : "";
        const rate = region.countingRate == null ? "대기" : formatRate(region.countingRate);
        const leader = region.leader?.name
          ? `${region.leader.name} ${formatRate(region.leader.rate)}`
          : "후보 데이터 대기";
        return html`
          <button
            className=${`region-item${selected}`}
            type="button"
            key=${region.cityCode}
            onClick=${() => {
              chooseRegion(region.cityCode);
              setFilter(filter);
            }}
          >
            <span className="region-name">${region.cityName}</span>
            <span className="region-meta">${rate} · ${leader}</span>
          </button>
        `;
      })}
    </aside>
  `;
}

function SeatSharePanel({ selectedElection }) {
  const seatShare = useMemo(() => buildSeatShare(selectedElection), [selectedElection]);

  if (!selectedElection) return null;

  return html`
    <aside className="seat-share-panel" aria-labelledby="seat-share-title">
      <div className="seat-share-heading">
        <div>
          <p className="eyebrow">${selectedElection.shortName ?? selectedElection.name}</p>
          <h3 id="seat-share-title">전국 정당별 우세 비율</h3>
        </div>
        ${seatShare.total
          ? html`<span className="seat-share-total">${formatNumber(seatShare.total)}곳</span>`
          : null}
      </div>

      ${seatShare.items.length
        ? html`
            <div className="seat-share-stack">
              ${seatShare.items.map(
                (item) => html`
                  <div className="seat-share-row" key=${item.party} style=${{ "--party-color": partyColor(item.party) }}>
                    <div className="seat-share-label">
                      <strong>${item.party}</strong>
                      <span>${formatNumber(item.count)}곳 · ${formatRate(item.rate)}</span>
                    </div>
                    <div className="seat-share-track" aria-hidden="true">
                      <span style=${{ width: `${Math.max(2, Math.min(100, item.rate))}%` }} />
                    </div>
                  </div>
                `,
              )}
            </div>
            <p className="seat-share-note">공식 득표 데이터의 현재 1위 기준입니다. 최종 당선 확정 결과와 다를 수 있습니다.</p>
          `
        : html`<p className="notice">정당별 우세 비율을 계산할 수 있는 데이터가 아직 없습니다.</p>`}
    </aside>
  `;
}

function RacePanel({ selectedRegion, selectedElection, races, visibleRaces, selectedRaceKey, filter }) {
  if (!selectedRegion && !races.length) {
    return html`<div className="race-panel"><p className="muted">지역 데이터가 아직 없습니다.</p></div>`;
  }

  if (!races.length) {
    const query = filter.trim();
    return html`
      <div className="race-panel">
        <div className="race-heading">
          <div>
            <p className="eyebrow">${selectedElection?.name ?? "선거종류"}</p>
            <h3>${selectedRegion?.cityName ?? "선택 지역"}</h3>
          </div>
        </div>
        <p className="notice">
          ${query
            ? `"${query}"에 맞는 세부 지역이 이 선거종류에는 없습니다. 다른 선거종류 탭도 확인해 보세요.`
            : "이 지역의 해당 선거종류 개표 데이터가 아직 없습니다."}
        </p>
      </div>
    `;
  }

  const leadingRace =
    races.find((race) => race.unitName === "합계") ??
    races.find((race) => Number(race.totalVotes || 0) > 0 || Number(race.countingRate || 0) > 0) ??
    races[0];
  const showUnitName = visibleRaces.length > 1 || selectedRaceKey !== ALL_RACES;

  return html`
    <div className="race-panel">
      <div className="race-heading panel-heading">
        <div>
          <p className="eyebrow">${selectedElection?.name ?? leadingRace.electionName}</p>
          <h3>${selectedRegion?.cityName ?? leadingRace.cityName}</h3>
        </div>
        <span className="count-rate">${formatRate(leadingRace.countingRate)}</span>
      </div>
      <div className="race-group">
        ${visibleRaces.map((race) => html`<${RaceCard} key=${race.raceKey} race=${race} showUnitName=${showUnitName} />`)}
      </div>
    </div>
  `;
}

function RaceCard({ race, showUnitName }) {
  const hasCandidates = race.candidates?.length > 0;
  const gapText =
    race.voteGap == null ? "격차 대기" : `${formatNumber(race.voteGap)}표 · ${formatRate(race.rateGap)}p`;

  return html`
    <article className="race-card">
      ${showUnitName
        ? html`
            <div className="race-heading race-card-heading">
              <div>
                <p className="eyebrow">${race.areaName ?? race.electionShortName ?? race.electionName}</p>
                <h3>${race.unitName ?? race.cityName}</h3>
              </div>
              <span className="count-rate">${formatRate(race.countingRate)}</span>
            </div>
          `
        : null}
      <div className="race-summary">
        <div><span>투표수</span><strong>${formatNumber(race.totalVotes)}</strong></div>
        <div><span>유효표</span><strong>${formatNumber(race.validVotes)}</strong></div>
        <div><span>1-2위 격차</span><strong>${gapText}</strong></div>
      </div>
      ${hasCandidates
        ? html`<div className="candidate-list">${race.candidates.map((candidate) => html`<${CandidateCard} key=${`${candidate.name}-${candidate.party}`} candidate=${candidate} />`)}</div>`
        : html`<p className="notice">공식 후보별 득표 데이터 갱신 대기 중입니다. 선관위 원문 링크에서 즉시 확인할 수 있습니다.</p>`}
    </article>
  `;
}

function CandidateCard({ candidate }) {
  const width = Math.max(2, Math.min(100, Number(candidate.rate || 0)));
  const color = partyColor(candidate.party);
  const photoUrl = candidatePhotoUrl(candidate);

  return html`
    <article className="candidate-card" style=${{ "--party-color": color }}>
      <div className="candidate-topline">
        <div className="candidate-portrait">
          ${photoUrl
            ? html`<img src=${photoUrl} alt="${candidate.name} 후보 사진" loading="lazy" referrerPolicy="no-referrer" onError=${(event) => event.currentTarget.remove()} />`
            : null}
          <span className="portrait-fallback">${candidateInitial(candidate)}</span>
          <span className="rank-badge">${candidate.rank}</span>
        </div>
        <div className="candidate-name">
          <strong>${candidate.name}</strong>
          <span>${candidate.party}</span>
        </div>
        <div className="candidate-rate">${formatRate(candidate.rate)}</div>
      </div>
      <div className="bar" aria-hidden="true"><span style=${{ width: `${width}%` }} /></div>
      <div className="candidate-votes">${formatNumber(candidate.votes)}표</div>
    </article>
  `;
}

function OfficialLinks() {
  return html`
    <section className="official-grid" aria-labelledby="official-title">
      <div>
        <h2 id="official-title">공식 확인</h2>
        <p>선관위 실시간 개표 페이지와 공식 개표소 현황을 빠르게 엽니다.</p>
      </div>
      <div className="button-row">
        <a className="button primary" href="https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP09" target="_blank" rel="noreferrer">개표진행상황</a>
        <a className="button" href="https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=VC&secondMenuId=VCCP08" target="_blank" rel="noreferrer">개표단위별 결과</a>
        <a className="button" href="https://info.nec.go.kr/main/showDocument.xhtml?electionId=0020260603&topMenuId=BI&secondMenuId=BICP01" target="_blank" rel="noreferrer">공식 개표소 현황</a>
        <a className="button" href="https://www.nec.go.kr/" target="_blank" rel="noreferrer">선관위</a>
      </div>
    </section>
  `;
}

function SiteFooter() {
  return html`
    <footer className="site-footer">
      <p>© 2026 gubiko. All rights reserved.</p>
      <p>정보 소스: 중앙선거관리위원회 실시간 개표 자료</p>
      <p>방송 목록은 시청 편의를 위해 제공되며, 특정 언론사나 정치적 입장을 지지하지 않습니다.</p>
    </footer>
  `;
}

function dataRegions(data) {
  const regions = data?.regions?.length ? data.regions : fallbackRegions;
  const searchTextByCityCode = buildRegionSearchTextByCityCode(data);
  return sortByKoreanName(
    regions.map((region) => ({
      ...region,
      cityName: region.cityName ?? region.name,
      shortName: region.shortName ?? region.cityName ?? region.name,
      candidates: region.candidates ?? [],
      searchText: searchTextByCityCode.get(region.cityCode) ?? "",
    })),
    (region) => region.cityName,
  );
}

function buildRegionSearchTextByCityCode(data) {
  const searchTextByCityCode = new Map();

  for (const election of data?.elections ?? []) {
    for (const region of election.regions ?? []) {
      appendRegionSearchText(searchTextByCityCode, region.cityCode, [
        election.name,
        election.shortName,
        region.cityName,
        region.shortName,
        region.name,
      ]);

      for (const race of region.races ?? []) {
        appendRegionSearchText(searchTextByCityCode, region.cityCode, raceSearchParts(race));
      }
    }
  }

  return searchTextByCityCode;
}

function appendRegionSearchText(searchTextByCityCode, cityCode, parts) {
  if (!cityCode) return;
  const nextText = normalizeSearchText(parts.filter(Boolean).join(" "));
  if (!nextText) return;
  const previousText = searchTextByCityCode.get(cityCode);
  searchTextByCityCode.set(cityCode, previousText ? `${previousText} ${nextText}` : nextText);
}

async function fetchLatestData({ onCachedPayload } = {}) {
  const cacheBucket = `v=${Math.floor(Date.now() / DATA_CACHE_BUCKET_MS)}`;
  const cachedPayload = readCachedPayload();
  if (cachedPayload) onCachedPayload?.(cachedPayload);

  let staticPayload = cachedPayload;
  try {
    staticPayload = await fetchStaticData(cacheBucket, "cached static data");
    writeCachedPayload(staticPayload);
    onCachedPayload?.(staticPayload);
  } catch {
    if (!staticPayload) throw new Error("cached data unavailable");
  }

  if (isGitHubPagesHost()) {
    return staticPayload;
  }

  try {
    const liveResponse = await fetchWithTimeout(LIVE_REFRESH_ENDPOINT, LIVE_FETCH_TIMEOUT_MS);
    if (liveResponse.ok) {
      const payload = await liveResponse.json();
      writeCachedPayload(payload);
      return payload;
    }

    const contentType = liveResponse.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`/api/latest HTTP ${liveResponse.status}`);
    }
  } catch (error) {
    return {
      ...staticPayload,
      delivery: {
        ...(staticPayload.delivery ?? {}),
        mode: staticPayload.delivery?.mode ?? "static-fallback",
        reason: error?.message ?? "live API unavailable",
      },
    };
  }

  return {
    ...staticPayload,
    delivery: {
      ...(staticPayload.delivery ?? {}),
      mode: staticPayload.delivery?.mode ?? "static-fallback",
      reason: "live API unavailable on static hosting",
    },
  };
}

async function fetchStaticData(cacheBust, reason) {
  const staticResponse = await fetch(`${STATIC_ENDPOINT}?${cacheBust}`, { cache: "force-cache" });
  if (!staticResponse.ok) throw new Error(`data/latest.json HTTP ${staticResponse.status}`);
  const payload = await staticResponse.json();
  return {
    ...payload,
    delivery: {
      mode: "static-fallback",
      reason,
    },
  };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "default",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function readCachedPayload() {
  try {
    const raw = window.localStorage.getItem(LOCAL_DATA_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return null;
    return {
      ...payload,
      delivery: {
        ...(payload.delivery ?? {}),
        mode: payload.delivery?.mode ?? "browser-cache",
        reason: payload.delivery?.reason ?? "browser cached data",
      },
    };
  } catch {
    return null;
  }
}

function writeCachedPayload(payload) {
  try {
    window.localStorage.setItem(LOCAL_DATA_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; network/static cache still keeps the page usable.
  }
}

function isGitHubPagesHost() {
  return window.location.hostname.endsWith(".github.io");
}

function dataElections(data) {
  if (data?.elections?.length) {
    return data.elections.map((election) => ({
      ...election,
      regions: sortByKoreanName(
        (election.regions ?? []).map((region) => ({
          ...region,
          races: sortRacesForDisplay(region.races ?? []),
        })),
        (region) => region.cityName ?? region.name,
      ),
    }));
  }

  const regions = data?.regions?.length ? data.regions : [];
  if (!regions.length) return [];

  return [
    {
      code: "3",
      name: "시·도지사선거",
      shortName: "시도지사",
      regionCount: regions.length,
      raceCount: regions.length,
      regions: sortByKoreanName(
        regions.map((region) => ({
          cityCode: region.cityCode,
          cityName: region.cityName ?? region.name,
          shortName: region.shortName ?? region.cityName ?? region.name,
          races: [region],
        })),
        (region) => region.cityName,
      ),
    },
  ];
}

function buildSeatShare(election) {
  if (!election || election.code === "11") return { total: 0, items: [] };

  const counts = new Map();
  let total = 0;

  for (const region of election.regions ?? []) {
    const races = region.races ?? [];
    const aggregateRaces = races.filter(isAggregateRace);
    const targetRaces = aggregateRaces.length ? aggregateRaces : races.filter((race) => !isAggregateRace(race));

    for (const race of targetRaces) {
      const leader = race.leader;
      if (!leader?.party || !leader?.name) continue;
      if (Number(leader.votes || 0) <= 0 && Number(leader.rate || 0) <= 0) continue;

      const party = leader.party.trim();
      counts.set(party, (counts.get(party) ?? 0) + 1);
      total += 1;
    }
  }

  const items = [...counts.entries()]
    .map(([party, count]) => ({
      party,
      count,
      rate: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || koreanSorter.compare(a.party, b.party));

  return { total, items };
}

function sortByKoreanName(items, getName) {
  return [...items].sort((a, b) => koreanSorter.compare(String(getName(a) ?? ""), String(getName(b) ?? "")));
}

function sortRacesForDisplay(races) {
  return [...races].sort((a, b) => {
    const aAggregate = isAggregateRace(a);
    const bAggregate = isAggregateRace(b);
    if (aAggregate !== bAggregate) return aAggregate ? -1 : 1;
    return koreanSorter.compare(raceDisplayName(a), raceDisplayName(b));
  });
}

function invertRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [value, key]));
}

function parseRoute(pathname) {
  const segments = String(pathname ?? "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  const route = {
    regionCode: null,
    electionCode: null,
    raceSlug: null,
  };

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const value = segments[index + 1];
    if (!value) continue;

    if (segment === "region") {
      route.regionCode = REGION_CODES_BY_SLUG[value] ?? null;
      index += 1;
    } else if (segment === "election") {
      route.electionCode = ELECTION_CODES_BY_SLUG[value] ?? null;
      index += 1;
    } else if (segment === "race") {
      route.raceSlug = value;
      index += 1;
    }
  }

  return route;
}

function hasRouteRequest(route) {
  return Boolean(route?.regionCode || route?.electionCode || route?.raceSlug);
}

function replaceRouteForSelection(region, election, race) {
  const nextPath = routePath(region, election, race);
  if (!nextPath || nextPath === window.location.pathname) return;
  window.history.replaceState(null, "", `${nextPath}${window.location.search}${window.location.hash}`);
}

function routePath(region, election, race) {
  const regionSlug = REGION_SLUGS[region?.cityCode];
  const electionSlug = ELECTION_SLUGS[election?.code];
  if (!regionSlug || !electionSlug) return "/";

  const parts = ["", "region", regionSlug, "election", electionSlug];
  if (race) parts.push("race", raceSlug(race));
  return parts.join("/");
}

function raceSlug(race) {
  return [
    "race",
    race.electionCode ?? "e",
    race.cityCode ?? "city",
    race.areaCode ?? "area",
    hashSlug(race.raceKey ?? race.unitName ?? race.areaName ?? race.cityName),
  ]
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean)
    .join("-");
}

function updateRouteSeo({ region, election, race, national, generatedAt }) {
  const path = routePath(region, election, race);
  const canonicalUrl = `${SITE_URL}${path === "/" ? "/" : path}`;
  const title = buildRouteTitle(region, election, race);
  const description = buildRouteDescription({ region, election, race, national, generatedAt });

  document.title = title;
  setMetaContent("description", description);
  setMetaContent("twitter:title", title);
  setMetaContent("twitter:description", description);
  setMetaProperty("og:title", title);
  setMetaProperty("og:description", description);
  setMetaProperty("og:url", canonicalUrl);
  setLinkHref("canonical", canonicalUrl);
}

function buildRouteTitle(region, election, race) {
  if (region?.cityName && election?.shortName && race?.unitName) {
    return `${region.cityName} ${race.unitName} ${election.shortName} 실시간 개표율 | 개표라이브`;
  }
  if (region?.cityName && election?.shortName) {
    return `${region.cityName} ${election.shortName} 실시간 개표율 | 개표라이브`;
  }
  if (region?.cityName) return `${region.cityName} 지방선거 실시간 개표율 | 개표라이브`;
  return "2026 지방선거 실시간 개표율 | 지역별 후보 우세율·개표방송";
}

function buildRouteDescription({ region, election, race, national, generatedAt }) {
  const timeText = generatedAt ? formatGeneratedAt(generatedAt) : "실시간 기준";
  const rateText = national?.averageCountingRate == null ? "" : ` 전국 평균 개표율 ${formatRate(national.averageCountingRate)}.`;
  const raceText = race?.unitName ? ` ${race.unitName} 선거구의 후보별 득표율과 표차를 확인하세요.` : "";
  if (region?.cityName && election?.shortName) {
    return `${timeText} ${region.cityName} ${election.shortName} 개표 상황입니다.${raceText} 선관위 공식 개표 데이터 기반으로 1분마다 갱신됩니다.`;
  }
  return `${timeText} 2026 지방선거 실시간 개표율과 지역별 후보 우세율입니다.${rateText} 선관위 공식 개표 데이터 기반으로 1분마다 갱신됩니다.`;
}

function setMetaContent(name, content) {
  const element = document.querySelector(`meta[name="${cssEscape(name)}"]`);
  if (element) element.setAttribute("content", content);
}

function setMetaProperty(property, content) {
  const element = document.querySelector(`meta[property="${cssEscape(property)}"]`);
  if (element) element.setAttribute("content", content);
}

function setLinkHref(rel, href) {
  const element = document.querySelector(`link[rel="${cssEscape(rel)}"]`);
  if (element) element.setAttribute("href", href);
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function hashSlug(value) {
  let hash = 5381;
  for (const char of String(value ?? "")) {
    hash = (hash * 33) ^ char.codePointAt(0);
  }
  return `h${(hash >>> 0).toString(36)}`;
}

function raceDisplayName(race) {
  return race.unitName ?? race.areaName ?? race.cityName ?? "";
}

function raceSearchParts(race) {
  return [
    race.cityName,
    race.shortName,
    race.areaName,
    race.unitName,
    race.electionName,
    race.electionShortName,
    race.raceKey,
  ];
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesRegionSearch(region, normalizedQuery) {
  if (!normalizedQuery) return true;
  return normalizeSearchText([region.cityName, region.shortName, region.name, region.searchText].filter(Boolean).join(" ")).includes(
    normalizedQuery,
  );
}

function matchesRaceSearch(race, normalizedQuery) {
  if (!normalizedQuery) return true;
  return normalizeSearchText(raceSearchParts(race).filter(Boolean).join(" ")).includes(normalizedQuery);
}

function hasRaceData(region) {
  return Number(region?.totalVotes || 0) > 0 || Number(region?.countingRate || 0) > 0;
}

function statusLabel(data) {
  if (!data) return { className: "warning", text: "데이터 로딩 중" };
  if (data.status === "ok") {
    if (data.delivery?.mode === "serverless-live") return { className: "ok", text: "공식 실시간 수집" };
    if (data.delivery?.mode === "static-fallback") return { className: "warning", text: "저장 데이터 표시" };
    return isStale(data.generatedAt)
      ? { className: "warning", text: "공식 데이터 오래됨" }
      : { className: "ok", text: "공식 데이터 반영" };
  }
  if (data.status === "fixture") return { className: "warning", text: "준비 데이터 표시 중" };
  if (data.status === "error") return { className: "danger", text: "공식 데이터 연결 실패" };
  return { className: "warning", text: "공식 데이터 갱신 대기" };
}

function isStale(isoValue) {
  if (!isoValue) return true;
  const generated = new Date(isoValue).getTime();
  if (!Number.isFinite(generated)) return true;
  return Date.now() - generated > 30 * 60 * 1000;
}

function formatGeneratedAt(value) {
  if (!value) return "업데이트 대기";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "시각 확인 불가";
  const today = new Date();
  const sameDay =
    time.getFullYear() === today.getFullYear() &&
    time.getMonth() === today.getMonth() &&
    time.getDate() === today.getDate();
  return sameDay ? `${time.toLocaleTimeString("ko-KR")} 기준` : `${time.toLocaleString("ko-KR")} 기준`;
}

function formatCheckedAt(value) {
  if (!value) return "대기";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? "시각 확인 불가" : time.toLocaleTimeString("ko-KR");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatRate(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function isSubtotalRace(race) {
  return race?.unitName?.replace(/\s+/g, "") === "소계";
}

function isAggregateRace(race) {
  return ["소계", "합계"].includes(race?.unitName?.replace(/\s+/g, ""));
}

function partyColor(party = "") {
  if (party.includes("더불어민주당")) return "#1f4e9d";
  if (party.includes("국민의힘")) return "#c43c3c";
  if (party.includes("정의당")) return "#d6a100";
  if (party.includes("개혁신당")) return "#d96b2b";
  if (party.includes("진보당")) return "#b91c1c";
  if (party.includes("여성의당")) return "#7c4d9e";
  if (party.includes("기본소득당")) return "#008b8b";
  if (party.includes("무소속")) return "#6b7280";
  return "#52525b";
}

function candidatePhotoUrl(candidate) {
  return candidate.photoUrl ?? candidate.photoThumbnailUrl ?? candidate.imageUrl ?? candidate.profileImage ?? "";
}

function candidateInitial(candidate) {
  return [...String(candidate.name || candidate.party || candidate.rank || "?").trim()][0] || "?";
}

createRoot(document.querySelector("#root")).render(html`<${App} />`);
