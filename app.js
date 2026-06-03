const broadcasts = [
  {
    name: "KBS",
    description: "KBS 선거 개표 방송",
    url: "https://www.youtube.com/@KBSnews/streams",
  },
  {
    name: "MBC",
    description: "MBC 선거 개표 방송",
    url: "https://www.youtube.com/@MBCNEWS11/streams",
  },
  {
    name: "SBS/YTN",
    description: "주요 방송사 선거 라이브",
    url: "https://www.youtube.com/results?search_query=%EC%A7%80%EB%B0%A9%EC%84%A0%EA%B1%B0+%EA%B0%9C%ED%91%9C%EB%B0%A9%EC%86%A1+%EC%8B%A4%EC%8B%9C%EA%B0%84",
  },
];

const regions = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

const broadcastGrid = document.querySelector("#broadcast-grid");
const regionList = document.querySelector("#region-list");
const racePanel = document.querySelector("#race-panel");
const searchForm = document.querySelector("#region-search");
const regionInput = document.querySelector("#region-input");

function renderBroadcasts() {
  broadcastGrid.innerHTML = broadcasts
    .map(
      (broadcast) => `
        <article class="broadcast-card">
          <h3>${broadcast.name}</h3>
          <p class="muted">${broadcast.description}</p>
          <a class="button" href="${broadcast.url}" target="_blank" rel="noreferrer">라이브 열기</a>
        </article>
      `,
    )
    .join("");
}

function renderRegions(filter = "") {
  const normalizedFilter = filter.trim().toLowerCase();
  const visibleRegions = regions.filter((region) => region.toLowerCase().includes(normalizedFilter));

  regionList.innerHTML = visibleRegions
    .map((region) => `<button class="region-item" type="button" data-region="${region}">${region}</button>`)
    .join("");
}

function showRegion(region) {
  racePanel.innerHTML = `
    <h3>${region}</h3>
    <p class="muted">다음 커밋에서 선관위 개표 표 파싱 결과가 이 영역에 연결됩니다.</p>
  `;
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderRegions(regionInput.value);
});

regionInput.addEventListener("input", () => {
  renderRegions(regionInput.value);
});

regionList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-region]");
  if (!button) return;
  showRegion(button.dataset.region);
});

renderBroadcasts();
renderRegions();
