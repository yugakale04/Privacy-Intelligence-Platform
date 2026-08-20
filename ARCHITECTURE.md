# Architecture

## High-level architecture

```text
Browser Extension
  Popup/UI ─ Content Script ─ Background Service Worker
                                  │
                                  ▼
                            Backend API
                     ┌────────────┼────────────┐
                     ▼            ▼            ▼
            Detection/Extraction Processing  Analysis
                                                  │
                                         Risk Engine + AI Explanation
                                                  │
                                           Database (when required)
```

The extension obtains page context and displays results. The backend performs policy processing and analysis; it owns all secrets and any AI-provider integrations.

## Extension components

| Component | Responsibility |
| --- | --- |
| Popup/UI | Show current-site status, score, findings, evidence links, and limitations. |
| Content script | Inspect the current document for candidate policy links and permitted page text; send minimal context to the service worker. |
| Background service worker | Coordinate extension events, backend requests, caching/session state, and user-visible analysis status. |

## Backend components

| Component | Responsibility |
| --- | --- |
| API | Validate requests, enforce size/origin limits, and return versioned analysis results. |
| Detection/extraction | Resolve a candidate policy URL and retrieve/extract policy text. |
| Processing | Clean text, preserve source locations, and produce normalized sections. |
| Privacy analysis | Identify supported statements and emit structured, evidence-linked findings. |
| Risk engine | Apply documented rules to findings and return a score plus contributors. |
| AI explanation layer | Explain evidence-backed findings in plain language; never add unsupported facts. |
| Database (deferred) | Store only data required by a later approved module, with retention controls. |

## Analysis pipeline

`candidate URL → source retrieval → text extraction → normalization/sections → evidence-backed findings → category classification → risk calculation → plain-language explanation → response`

Every intermediate result must preserve enough source context to link a displayed finding to policy evidence. Unknown, unavailable, or ambiguous information remains explicitly labeled as such.

## Data flow

1. The content script discovers candidate policy references from the active page.
2. The service worker sends the smallest necessary request to the backend.
3. The backend retrieves/processes policy content and returns findings, evidence, score details, and analysis metadata.
4. The service worker relays the result to the popup/UI for the current site.

The extension does not contain API keys. Browser permissions must be justified by a concrete module requirement.

## Responsibility boundaries

- The extension does not make legal conclusions or retain unnecessary browsing data.
- The backend is the sole trust boundary for secrets, external AI calls, and analysis rules.
- The risk engine scores structured findings, not raw AI assertions.
- The explanation layer may simplify results but must cite existing evidence and disclose uncertainty.

## Finding and evidence contract

All future privacy analyzers use the shared `Finding` and `Evidence` contract. A finding is limited to a controlled privacy category, severity, confidence from 0 to 1, a plain statement, and one or more evidence items. Each evidence item references an M7 `sectionId` and `chunkId`; validation verifies that the chunk belongs to that section. This shared contract is serialized for future backend/API and frontend use. Risk and summary fields are reserved in `AnalysisResult` but are not populated until their dedicated modules.
