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

const state = {
  data: null,
  selectedCode: null,
  selectedElectionCode: "3",
  filter: "",
  autoRefreshSeconds: 60,
};

const broadcastGrid = document.querySelector("#broadcast-grid");
const regionList = document.querySelector("#region-list");
const racePanel = document.querySelector("#race-panel");
const searchForm = document.querySelector("#region-search");
const regionInput = document.querySelector("#region-input");
const updatedAt = document.querySelector("#updated-at");
const sourceStatus = document.querySelector("#source-status");
const nationalGrid = document.querySelector("#national-grid");
const refreshButton = document.querySelector("#refresh-data");
const electionTabs = document.querySelector("#election-tabs");

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatRate(value) {
  return `${Number(value || 0).toFixed(2)}%`;
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

function isStale(isoValue) {
  if (!isoValue) return true;
  const generated = new Date(isoValue).getTime();
  if (!Number.isFinite(generated)) return true;
  return Date.now() - generated > 30 * 60 * 1000;
}

function statusLabel(data) {
  if (!data) return { className: "warning", text: "데이터 로딩 중" };
  if (data.status === "ok") {
    return isStale(data.generatedAt)
      ? { className: "warning", text: "공식 데이터 오래됨" }
      : { className: "ok", text: "공식 데이터 반영" };
  }
  if (data.status === "fixture") return { className: "warning", text: "준비 데이터 표시 중" };
  if (data.status === "error") return { className: "danger", text: "공식 데이터 연결 실패" };
  return { className: "warning", text: "공식 데이터 갱신 대기" };
}

async function loadData() {
  setLoading(true);
  try {
    const response = await fetch(`./data/latest.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`data/latest.json HTTP ${response.status}`);
    state.data = await response.json();
    syncSelectedRegion();
    syncSelectedElection();
  } catch (error) {
    state.data = {
      status: "error",
      generatedAt: new Date().toISOString(),
      national: {},
      regions: [],
      errors: [error.message],
    };
  } finally {
    setLoading(false);
    renderAll();
  }
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "갱신 중" : "지금 갱신";
}

function dataRegions() {
  const regions = state.data?.regions?.length ? state.data.regions : fallbackRegions;
  return regions.map((region) => ({
    ...region,
    cityName: region.cityName ?? region.name,
    shortName: region.shortName ?? region.cityName ?? region.name,
    candidates: region.candidates ?? [],
  }));
}

function dataElections() {
  if (state.data?.elections?.length) return state.data.elections;

  const regions = state.data?.regions?.length ? state.data.regions : [];
  if (!regions.length) return [];

  return [
    {
      code: "3",
      name: "시·도지사선거",
      shortName: "시도지사",
      regionCount: regions.length,
      raceCount: regions.length,
      regions: regions.map((region) => ({
        cityCode: region.cityCode,
        cityName: region.cityName ?? region.name,
        shortName: region.shortName ?? region.cityName ?? region.name,
        races: [region],
      })),
    },
  ];
}

function syncSelectedRegion() {
  const regions = dataRegions();
  if (regions.some((region) => region.cityCode === state.selectedCode)) return;

  const firstReportingRegion = regions.find(hasRaceData);
  state.selectedCode = (firstReportingRegion ?? regions[0])?.cityCode ?? state.selectedCode;
}

function syncSelectedElection() {
  const available = availableElectionsForSelectedRegion();
  if (available.some(({ election }) => election.code === state.selectedElectionCode)) return;

  const preferred = available.find(({ election }) => election.code === "3") ?? available[0];
  state.selectedElectionCode = preferred?.election.code ?? "3";
}

function hasRaceData(region) {
  return Number(region?.totalVotes || 0) > 0 || Number(region?.countingRate || 0) > 0;
}

function availableElectionsForSelectedRegion() {
  return dataElections()
    .map((election) => ({
      election,
      region: election.regions?.find((item) => item.cityCode === state.selectedCode),
    }))
    .filter(({ region }) => region?.races?.length > 0);
}

function renderAll() {
  renderSourceStatus();
  renderNational();
  renderRegions(state.filter);
  syncSelectedElection();
  renderElectionTabs();
  showRegion(state.selectedCode);
}

function renderBroadcasts() {
  broadcastGrid.innerHTML = broadcasts
    .map(
      (broadcast) => {
        const playerParams = "autoplay=1&mute=1&playsinline=1&rel=0";
        const embedUrl = broadcast.videoId
          ? `https://www.youtube.com/embed/${broadcast.videoId}?${playerParams}`
          : `https://www.youtube.com/embed/live_stream?channel=${broadcast.channelId}&${playerParams}`;
        return `
        <article class="broadcast-card">
          <div class="broadcast-frame">
            <iframe
              title="${broadcast.name} live"
              src="${embedUrl}"
              loading="eager"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>
          <div class="broadcast-meta">
            <h3>${broadcast.name}</h3>
            <p class="muted">${broadcast.description}</p>
            <a class="text-link" href="${broadcast.url}" target="_blank" rel="noreferrer">유튜브에서 보기</a>
          </div>
        </article>
      `;
      },
    )
    .join("");
}

function renderSourceStatus() {
  const label = statusLabel(state.data);
  sourceStatus.className = `status-pill ${label.className}`;
  sourceStatus.textContent = `${label.text} · 자동 갱신 중`;

  if (!state.data?.generatedAt) {
    updatedAt.textContent = "업데이트 대기";
    return;
  }

  const time = new Date(state.data.generatedAt);
  updatedAt.textContent = Number.isNaN(time.getTime())
    ? "업데이트 시각 확인 불가"
    : `${time.toLocaleString("ko-KR")} 기준`;
}

function renderNational() {
  const national = state.data?.national ?? {};
  const regions = dataRegions();
  const errors = state.data?.errors ?? [];
  const items = [
    ["평균 개표율", formatRate(national.averageCountingRate)],
    ["집계 지역", `${formatNumber(national.reportingRegions)} / ${formatNumber(regions.length)}`],
    ["투표수", formatNumber(national.totalVotes)],
    ["유효표", formatNumber(national.validVotes)],
  ];

  nationalGrid.innerHTML = `
    ${items
      .map(
        ([label, value]) => `
          <div class="metric">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `,
      )
      .join("")}
    ${errors.length ? `<p class="notice">${errors.slice(0, 2).join(" / ")}</p>` : ""}
  `;
}

function renderRegions(filter = "") {
  state.filter = filter;
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleRegions = dataRegions().filter((region) =>
    `${region.cityName} ${region.shortName}`.toLowerCase().includes(normalizedFilter),
  );

  regionList.innerHTML = visibleRegions
    .map((region) => {
      const selected = region.cityCode === state.selectedCode ? " selected" : "";
      const rate = region.countingRate == null ? "대기" : formatRate(region.countingRate);
      const leader = region.leader?.name ? `${region.leader.name} ${formatRate(region.leader.rate)}` : "후보 데이터 대기";
      return `
        <button class="region-item${selected}" type="button" data-region="${region.cityCode}">
          <span class="region-name">${region.cityName}</span>
          <span class="region-meta">${rate} · ${leader}</span>
        </button>
      `;
    })
    .join("");
}

function renderElectionTabs() {
  const available = availableElectionsForSelectedRegion();

  if (!available.length) {
    electionTabs.innerHTML = "";
    return;
  }

  electionTabs.innerHTML = available
    .map(({ election, region }) => {
      const selected = election.code === state.selectedElectionCode ? " selected" : "";
      return `
        <button class="election-tab${selected}" type="button" data-election="${election.code}">
          <span>${election.shortName ?? election.name}</span>
          <strong>${formatNumber(region.races.length)}</strong>
        </button>
      `;
    })
    .join("");
}

function showRegion(cityCode) {
  state.selectedCode = cityCode;
  const summaryRegion = dataRegions().find((item) => item.cityCode === cityCode) ?? dataRegions()[0];
  syncSelectedElection();
  renderElectionTabs();

  const selectedElection = dataElections().find((election) => election.code === state.selectedElectionCode);
  const electionRegion = selectedElection?.regions?.find((item) => item.cityCode === state.selectedCode);
  const races = electionRegion?.races ?? [];
  const regionName = summaryRegion?.cityName ?? electionRegion?.cityName ?? "선택 지역";

  if (!summaryRegion && !electionRegion) {
    racePanel.innerHTML = `<p class="muted">지역 데이터가 아직 없습니다.</p>`;
    return;
  }

  if (!races.length) {
    racePanel.innerHTML = `
      <div class="race-heading">
        <div>
          <p class="eyebrow">${selectedElection?.name ?? "선거종류"}</p>
          <h3>${regionName}</h3>
        </div>
      </div>
      <p class="notice">이 지역의 해당 선거종류 개표 데이터가 아직 없습니다.</p>
    `;
    renderRegions(state.filter);
    return;
  }

  const leadingRace =
    races.find((race) => race.unitName === "합계") ??
    races.find((race) => Number(race.totalVotes || 0) > 0 || Number(race.countingRate || 0) > 0) ??
    races[0];

  racePanel.innerHTML = `
    <div class="race-heading panel-heading">
      <div>
        <p class="eyebrow">${selectedElection.name}</p>
        <h3>${regionName}</h3>
      </div>
      <span class="count-rate">${formatRate(leadingRace.countingRate)}</span>
    </div>
    <div class="race-group">
      ${races.map((race) => renderRaceCard(race, races.length > 1)).join("")}
    </div>
  `;

  renderRegions(state.filter);
}

function renderRaceCard(race, showUnitName = false) {
  const hasCandidates = race.candidates?.length > 0;
  const gapText =
    race.voteGap == null
      ? "격차 대기"
      : `${formatNumber(race.voteGap)}표 · ${formatRate(race.rateGap)}p`;

  return `
    <article class="race-card">
      ${
        showUnitName
          ? `<div class="race-heading race-card-heading">
      <div>
        <p class="eyebrow">${race.areaName ?? race.electionShortName ?? race.electionName}</p>
        <h3>${race.unitName ?? race.cityName}</h3>
      </div>
      <span class="count-rate">${formatRate(race.countingRate)}</span>
    </div>`
          : ""
      }
    <div class="race-summary">
      <div><span>투표수</span><strong>${formatNumber(race.totalVotes)}</strong></div>
      <div><span>유효표</span><strong>${formatNumber(race.validVotes)}</strong></div>
      <div><span>1-2위 격차</span><strong>${gapText}</strong></div>
    </div>
    ${
      hasCandidates
        ? `<div class="candidate-list">${race.candidates.map(renderCandidate).join("")}</div>`
        : `<p class="notice">공식 후보별 득표 데이터 갱신 대기 중입니다. 선관위 원문 링크에서 즉시 확인할 수 있습니다.</p>`
    }
    </article>
  `;
}

function renderCandidate(candidate) {
  const width = Math.max(2, Math.min(100, Number(candidate.rate || 0)));
  const color = partyColor(candidate.party);
  const photoUrl = candidatePhotoUrl(candidate);
  const portrait = photoUrl
    ? `<img src="${photoUrl}" alt="${candidate.name} 후보 사진" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`
    : "";
  return `
    <article class="candidate-card" style="--party-color: ${color}">
      <div class="candidate-topline">
        <div class="candidate-portrait">
          ${portrait}
          <span class="portrait-fallback">${candidateInitial(candidate)}</span>
          <span class="rank-badge">${candidate.rank}</span>
        </div>
        <div class="candidate-name">
          <strong>${candidate.name}</strong>
          <span>${candidate.party}</span>
        </div>
        <div class="candidate-rate">${formatRate(candidate.rate)}</div>
      </div>
      <div class="bar" aria-hidden="true"><span style="width: ${width}%"></span></div>
      <div class="candidate-votes">${formatNumber(candidate.votes)}표</div>
    </article>
  `;
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const first = dataRegions().find((region) =>
    `${region.cityName} ${region.shortName}`.toLowerCase().includes(regionInput.value.trim().toLowerCase()),
  );
  if (first) showRegion(first.cityCode);
});

regionInput.addEventListener("input", () => {
  renderRegions(regionInput.value);
});

regionList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-region]");
  if (!button) return;
  showRegion(button.dataset.region);
});

electionTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-election]");
  if (!button) return;
  state.selectedElectionCode = button.dataset.election;
  showRegion(state.selectedCode);
});

refreshButton.addEventListener("click", loadData);

renderBroadcasts();
renderRegions();
loadData();
window.setInterval(loadData, state.autoRefreshSeconds * 1000);
