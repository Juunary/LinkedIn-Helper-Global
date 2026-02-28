<!-- docs/60_TESTING_RISKS.md -->
# Testing & Risks

## Test Checklist
### Basic
- [ ] 리스트 스크롤 → 새 카드만 번역 요청
- [ ] 동일 카드 재노출 → 캐시로 즉시 표시
- [ ] 공고 클릭 → 상세 번역 1회 + 패널 렌더

### SPA Routing
- [ ] 검색 조건 변경/탭 이동(URL만 변경)에도 정상 동작
- [ ] 뒤로/앞으로(popstate)에도 패널 유지/재초기화

### Dynamic Widgets
- [ ] “이미 지원함/알림/배지” 삽입 후에도 정렬/스크롤 동기화 유지
- [ ] 상세가 늦게 로드(스켈레톤→본문)될 때도 안정적

### Performance
- [ ] 스크롤 중 프레임 드랍/멈춤 없음
- [ ] scroll/observer가 throttle/debounce로 제어됨

---

## Risk Register
- DOM 구조 변경 → 하드코딩 최소화, 특징 기반 탐색, graceful fallback
- API 비용 폭증 → viewport + 캐시 + rate limit + 옵션 제공
- 스크롤 오차 → 기본 ratio, 옵션으로 block-anchor 제공
- ToS/정책 → 텍스트만 전송, 사용자 동의/옵션, 개인정보 미수집 원칙