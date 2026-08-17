# Privacy Intelligence Platform — Project Scope

## Problem and motivation

Privacy policies are lengthy, legalistic, and rarely read. As a result, people accept services without a practical understanding of what personal data is collected, why it is used, who receives it, how long it is retained, or which choices they have. This platform makes those disclosures easier to inspect without replacing the underlying policy.

## Moto

> Read the Privacy Policy. Understand the Risk. Protect the User.

## Objectives

- Locate and extract a visited website's privacy-policy information.
- Convert supported policy statements into structured, evidence-backed findings.
- Classify findings across the ten core privacy categories.
- Calculate an explainable overall privacy risk score.
- Present clear, actionable results in a browser extension.

## Core workflow

1. A user visits a website.
2. The extension detects privacy-policy information.
3. The policy is located, extracted, cleaned, and structured.
4. The backend analyzes supported privacy practices and records source evidence.
5. Findings are classified and scored by the risk engine.
6. The extension displays the findings, evidence, score, and explanation.

## Core features

- Privacy-policy discovery and text extraction.
- Policy normalization and section-aware processing.
- Evidence-linked findings for: data collected, purposes, sharing/third parties, retention, rights, cookies/tracking, security, international transfers, and consent/choices.
- Transparent, rule-based risk scoring with score contributors.
- A popup interface for the current site and its analysis status.

## Non-goals

- Providing legal advice or certifying legal compliance.
- Inferring practices that are not supported by policy evidence.
- Collecting browsing histories or personal user data beyond what is necessary for an explicit analysis request.
- Embedding backend/API secrets in the extension.
- Building accounts, cross-device history, monitoring, or a database before a module requires them.
- Automatically changing a website's privacy settings or submitting user requests.

## Users and use cases

- **Everyday web users:** quickly understand a site's stated privacy practices before engaging.
- **Privacy-conscious users:** inspect evidence and compare risk contributors before sharing data.
- **Researchers/testers:** validate that the platform reports only evidence-supported, reproducible findings.

## Development principles

- Build one independently testable module at a time.
- Keep scoring and analysis explainable, deterministic where possible, and evidence-linked.
- Treat absent or ambiguous policy statements as unknown—not as a claim.
- Minimize permissions, data collection, dependencies, and retained data.
- Keep trust boundaries explicit: secrets and AI-provider calls remain on the backend.
- Test each module, run relevant builds/tests, document status, and avoid unrelated changes.
