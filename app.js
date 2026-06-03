const broadcasts = [
  {
    name: "KBS News",
    description: "KBS 뉴스 유튜브 라이브/스트림 목록",
    url: "https://www.youtube.com/@KBSnews/streams",
  },
  {
    name: "MBC News",
    description: "MBC 뉴스 유튜브 라이브/스트림 목록",
    url: "https://www.youtube.com/@MBCNEWS11/streams",
  },
  {
    name: "SBS/YTN",
    description: "SBS, YTN 등 선거 개표방송 검색",
    url: "https://www.youtube.com/results?search_query=%EC%A7%80%EB%B0%A9%EC%84%A0%EA%B1%B0+%EA%B0%9C%ED%91%9C%EB%B0%A9%EC%86%A1+SBS+YTN+%EC%8B%A4%EC%8B%9C%EA%B0%84",
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
  selectedCode: "1100",
  filter: "",
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatRate(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function isStale(isoValue) {
  if (!isoValue) return true;
  const generated = new Date(isoValue).getTime();
  if (!Number.isFinite(generated)) return true;
  return Date.now() - generated > 10 * 60 * 1000;
}

function statusLabel(data) {
  if (!data) return { className: "warning", text: "데이터 로딩 중" };
  if (data.status === "ok") {
    return isStale(data.generatedAt)
      ? { className: "warning", text: "공식 데이터 오래됨" }
      : { className: "ok", text: "공식 데이터 반영" };
  }
  if (data.status === "fixture") return { className: "warning", text: "검증용 fixture 데이터" };
  if (data.status === "error") return { className: "danger", text: "공식 데이터 갱신 실패" };
  return { className: "warning", text: "공식 데이터 갱신 대기" };
}

async function loadData() {
  setLoading(true);
  try {
    const response = await fetch(`./data/latest.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`data/latest.json HTTP ${response.status}`);
    state.data = await response.json();
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
  refreshButton.textContent = isLoading ? "갱신 중" : "새로고침";
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

function renderAll() {
  renderBroadcasts();
  renderSourceStatus();
  renderNational();
  renderRegions(state.filter);
  showRegion(state.selectedCode);
}

function renderBroadcasts() {
  broadcastGrid.innerHTML = broadcasts
    .map(
      (broadcast) => `
        <article class="broadcast-card">
          <div>
            <h3>${broadcast.name}</h3>
            <p class="muted">${broadcast.description}</p>
          </div>
          <a class="button" href="${broadcast.url}" target="_blank" rel="noreferrer">라이브 열기</a>
        </article>
      `,
    )
    .join("");
}

function renderSourceStatus() {
  const label = statusLabel(state.data);
  sourceStatus.className = `status-pill ${label.className}`;
  sourceStatus.textContent = label.text;

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

function showRegion(cityCode) {
  state.selectedCode = cityCode;
  const region = dataRegions().find((item) => item.cityCode === cityCode) ?? dataRegions()[0];
  if (!region) {
    racePanel.innerHTML = `<p class="muted">지역 데이터가 아직 없습니다.</p>`;
    return;
  }

  const hasCandidates = region.candidates?.length > 0;
  const gapText =
    region.voteGap == null
      ? "격차 대기"
      : `${formatNumber(region.voteGap)}표 · ${formatRate(region.rateGap)}p`;

  racePanel.innerHTML = `
    <div class="race-heading">
      <div>
        <p class="eyebrow">${region.electionName ?? "시·도지사선거"}</p>
        <h3>${region.cityName}</h3>
      </div>
      <span class="count-rate">${formatRate(region.countingRate)}</span>
    </div>
    <div class="race-summary">
      <div><span>투표수</span><strong>${formatNumber(region.totalVotes)}</strong></div>
      <div><span>유효표</span><strong>${formatNumber(region.validVotes)}</strong></div>
      <div><span>1-2위 격차</span><strong>${gapText}</strong></div>
    </div>
    ${
      hasCandidates
        ? `<div class="candidate-list">${region.candidates.map(renderCandidate).join("")}</div>`
        : `<p class="notice">공식 후보별 득표 데이터 갱신 대기 중입니다. 선관위 원문 링크에서 즉시 확인할 수 있습니다.</p>`
    }
  `;

  renderRegions(state.filter);
}

function renderCandidate(candidate) {
  const width = Math.max(2, Math.min(100, Number(candidate.rate || 0)));
  return `
    <article class="candidate-card">
      <div class="candidate-topline">
        <span class="rank">${candidate.rank}</span>
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

refreshButton.addEventListener("click", loadData);

renderBroadcasts();
renderRegions();
loadData();
