<!-- docs/20_OVERVIEW.md -->
# Project Overview

## Problem
- LinkedIn은 SPA이며 동적 렌더링/리렌더가 잦음
- Chrome 내장 번역기 사용 시 DOM 전체 변형 + JS 충돌로 UI Freeze/버벅임 발생

## Solution
- 원본 페이지 DOM을 변형하지 않고,
- 브라우저 좌/우 여백에 독립 번역 패널을 주입(Inject)하여 번역 텍스트를 렌더링
- 번역 텍스트는 원본 요소의 위치/스크롤과 동기화
- LinkedIn 동적 위젯 삽입/삭제에도 정렬이 유지되도록 Reflow 수행