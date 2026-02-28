<!-- docs/10_RULES.md -->
# Hard Rules (Non-negotiable)

## Core Goal
- 언어 장벽 없이 LinkedIn 해외 채용 공고를 원활하게 탐색하도록 돕는 Chrome Extension (Manifest V3)

## Absolute Constraint
- **원본 LinkedIn DOM을 변형하지 않는다.**
  - 기존 노드의 `innerText/innerHTML/style/class` 변경 금지
  - 번역기처럼 원본 DOM 전체 변형 방식 금지
  - 허용: document에 **우리 UI host element만 추가(주입)**

## UI Injection Rules
- 패널은 좌/우측 **빈 여백(Margin)**에 렌더링
- CSS 충돌 방지:
  - Shadow DOM 사용 권장
  - 패널은 `position: fixed`
- 화면 폭이 좁으면 fallback 모드(토글/오버레이/축소) 제공

## Performance Guardrails
- 스크롤 이벤트는 throttle 필수 (예: 16~50ms)
- MutationObserver는 heavy work 직접 금지
  - “변화 감지 → reflow 예약”만 수행
  - reflow는 rAF + debounce로 batch 처리
- Observer 콜백에서 대량 DOM 조작 금지 (queue/batch)

## Translation Cost Rules
- 리스트: viewport 기반 지연 번역 (IntersectionObserver)
- 상세: 클릭 시 일괄 번역 (문맥 유지)
- 캐시 필수: `chrome.storage.local` + (가능하면) LRU 정리

## Done Definition (Phase 수준)
- LinkedIn UI가 멈추지 않으며(Freeze 없음), 클릭/스크롤이 자연스럽다.