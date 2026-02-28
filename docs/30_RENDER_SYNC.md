<!-- docs/30_RENDER_SYNC.md -->
# Rendering & Sync Strategy

## Left Panel (Job List) — Lazy translate + viewport only
### Goal
- 현재 화면에 보이는 공고 카드만 번역하여 API 호출 최소화

### Implementation
- IntersectionObserver로 카드 요소(li/div 등) 관찰
- 새로 노출된 카드만:
  1) 텍스트 추출
  2) background에 번역 요청
  3) 결과를 좌측 패널에 렌더링

### Memory/DOM
- 화면 밖 항목은 숨기거나 최소 DOM 유지
- 캐시 히트 시 재호출 금지

### Important Note (Virtualized list)
- LinkedIn은 카드 DOM 재사용 가능
- element 기준 매핑 금지 → **공고 고유 식별자(jobId/href 등) 기준** 매핑 필수

---

## Right Panel (Job Detail) — batch translate + scroll sync
### Goal
- 공고 클릭 시 상세를 한 번에 번역 (문맥 유지 / 스크롤 딜레이 방지)
- 읽는 위치는 원본 상세 스크롤과 동기화

### Implementation
- 상세 컨테이너 탐지
- 공고 변경 시:
  1) 제목/요약/본문/리스트/섹션을 블록 단위로 수집
  2) batch 번역 (필요 시 chunking)
  3) 번역 패널에 구조 유지 렌더링

### Scroll Sync (Default: ratio)
- ratio = scrollTop / (scrollHeight - clientHeight)
- translated.scrollTop = ratio * (translated.scrollHeight - translated.clientHeight)

### Scroll Sync (Optional: block-anchor)
- 원본/번역 모두 블록 배열 렌더
- viewport 상단 기준 블록 index를 찾고 동일 index의 offsetTop으로 스크롤 이동

---

## Dynamic UI Mapping (Reflow)
### Goal
- “동문 근무 중/이미 지원함” 같은 위젯 삽입/삭제로 높이가 변해도 정렬 유지

### Implementation
- 절대 좌표(top:100px) 금지
- getBoundingClientRect 기반 위치 추적
- MutationObserver로 DOM 변경 감지 → reflow 예약(rAF + debounce)