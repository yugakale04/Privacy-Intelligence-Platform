# Development Plan

Modules are ordered so that each has a stable, testable contract before dependent behavior is added. No module authorizes implementation of later modules.

| # | Module | Objective | Inputs | Outputs | Dependencies | Testing requirements |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Project foundation | Establish repository conventions, documentation links, test command baseline, and extension/backend boundary contracts. | Scope and architecture docs | Minimal configuration and documented contracts | None | Verify repository checks run and documentation links are valid. |
| 2 | Shared analysis schema | Define versioned types for requests, policies, evidence, findings, categories, scores, and unknown states. | Sample policy/result fixtures | Validated schema and fixtures | 1 | Unit validation, invalid-input, and backward-compatibility tests. |
| 3 | Extension page context | Detect the active page and candidate privacy-policy links with minimum permissions. | DOM fixtures/current tab context | Candidate URLs and page metadata | 1, 2 | DOM/unit tests; permission review. |
| 4 | Backend API skeleton | Provide validated request/response handling and health/error contracts. | Schema-valid request | Versioned response/error | 2 | API contract, validation, and error-path tests. |
| 5 | Policy retrieval and extraction | Fetch an approved candidate and extract readable source text with provenance. | Candidate URL | Raw text, source URL, extraction metadata | 4 | Fixture tests for HTML/text, failures, size limits, and source attribution. |
| 6 | Policy processing | Normalize extracted text and identify sections without losing evidence locations. | Extracted policy text | Structured sections and offsets | 2, 5 | Normalization, section, and evidence-offset fixture tests. |
| 7 | Evidence-backed finding rules | Detect explicit statements in each privacy category; represent missing/ambiguous data as unknown. | Processed sections | Findings with quotes/locations and confidence/status | 2, 6 | Category fixture tests, false-positive cases, and evidence-required assertions. |
| 8 | Explainable risk engine | Calculate category and overall risk using documented rules and finding states. | Structured findings | Score, band, and contributor breakdown | 2, 7 | Deterministic scoring, boundary, unknown-state, and explanation tests. |
| 9 | AI explanation layer | Rewrite existing findings into plain language without adding claims. | Findings, evidence, scores | Evidence-linked explanations and limitations | 7, 8 | Grounding fixtures, unsupported-claim rejection, and fallback tests. |
| 10 | Extension integration | Coordinate analysis requests and render loading, success, unknown, and failure states. | Service-worker results | Popup experience for current site | 3, 4, 8, 9 | Component/integration tests and manual browser verification. |
| 11 | Privacy, security, and retention hardening | Apply final permission minimization, request controls, logging/retention rules, and secret handling. | Integrated system | Security/privacy checklist and controls | 10 | Permission audit, secret scan, retention/control tests, and regression suite. |

## Module delivery checklist

For every module: implement only its stated contract, add tests and fixtures, run the relevant test/build commands, fix failures, verify the result, and update `PROJECT_STATUS.md`. Record any architectural decision that changes a documented boundary.
