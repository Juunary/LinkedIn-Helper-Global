<!-- docs/50_IMPLEMENTATION_PLAN.md -->
# Implementation Plan (Milestones)

## Phase 1 — UI Skeleton
- [ ] Jobs 페이지에서 좌/우 패널 렌더
- [ ] Shadow DOM로 스타일 격리
- [ ] 좁은 화면 fallback(토글/축소/오버레이)

Done:
- LinkedIn UI 멈춤 없음(Freeze 없음), 기본 인터랙션 정상

## Phase 2 — Observers & Detection
- [ ] IntersectionObserver로 리스트 “현재 보이는 카드” 감지
- [ ] jobId 추출 로직(href 기반 등) 확정
- [ ] 상세 컨테이너 탐지 + 공고 변경 감지

Done:
- 관찰 이벤트 과도 발생 없음, 탐지 안정적

## Phase 3 — Translation + Scroll Sync
- [ ] background 번역 브로커(DeepL 1차)
- [ ] 리스트 텍스트 번역/렌더
- [ ] 상세 블록 추출 → 일괄 번역/렌더
- [ ] scroll sync(비율) + throttle

Done:
- 스크롤 동기화 자연스럽고 API 호출이 viewport 기반으로 제한됨

## Phase 4 — Mutation 대응 + 최적화
- [ ] MutationObserver 기반 reflow 디버깅/안정화
- [ ] 캐시 적용 강화 + 재번역 방지
- [ ] 에러/재시도 UX

Done:
- 10분+ 사용 시 메모리 누수/패널 밀림/오작동 체감 없음