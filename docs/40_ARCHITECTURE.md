<!-- docs/40_ARCHITECTURE.md -->
# Architecture (Manifest V3)

## Frontend
- HTML/CSS/Vanilla JS (프레임워크 최소화)

## Extension Components
- manifest.json
  - permissions: activeTab, scripting, storage
  - host_permissions: https://www.linkedin.com/*
- content_script.js
  - 패널 주입(Shadow DOM)
  - IntersectionObserver (좌측 리스트)
  - 상세 감지 + scroll sync
  - MutationObserver → reflow 스케줄링
- background.js (service worker)
  - 번역 API 호출 (CORS 우회/키 보호)
  - content ↔ background 메시지 브로커
- options.html / options.js (권장)
  - API Key/언어/동기화 방식/캐시 설정

## Message Protocol
- content → background:
  - { type:"TRANSLATE", jobId, scope:"LIST"|"DETAIL", payload }
- background → content:
  - { type:"TRANSLATE_RESULT", jobId, scope, translated }
  - { type:"TRANSLATE_ERROR", jobId, scope, error }

## Caching
- key: hash(sourceText + targetLang + providerVersion)
- store: chrome.storage.local
- policy: 중복 번역 금지, 용량 초과 시 LRU 정리(간단 구현)
- list: 공고 단위 캐시 / detail: 블록 단위 캐시 가능

## DOM-Change Resilience
- LinkedIn 라우팅 변경(pushState/popstate)에 재초기화 필요
- 선택자 하드코딩 최소화 + 특징 기반 탐색 병행