# M1 Technical Decisions

## Stack

- **Runtime/language:** Node.js 20+ and TypeScript. Node provides a stable server runtime and TypeScript creates a shared type boundary without introducing a schema library before M2.
- **Backend:** Fastify. It is compact, supports typed handlers and test injection, and is suitable for a REST API that may later call NLP/LLM services behind the backend boundary.
- **Extension:** Chrome/Chromium Manifest V3 with a deliberately permission-free manifest. No popup, content script, or service worker is added until a module requires it.
- **Tests:** Vitest, initially used for backend API tests.
- **Workspace management:** npm workspaces, which is included with Node/npm and avoids an extra monorepo dependency.

## Boundaries preserved

The backend remains the sole future location for secrets and third-party AI integrations. The extension remains free of API keys and currently performs no collection, detection, or network activity. Data storage, authentication, and databases are deferred.

## Deferred decisions

- Popup/UI framework and build tooling (likely React + Vite when M10 is implemented).
- API schema validation library (M2 defines the shared schema contract first).
- CORS policy (needed only when an extension module makes backend requests).
- Persistence, AI/ML providers, authentication, and policy-analysis logic.

## M2 module-numbering adjustment

The initial development plan labeled the shared schema as module 2. The requested delivery sequence designates the browser-extension skeleton as M2 and the subsequent extension page-context work as M3. This changes delivery numbering only; it does not alter the documented architecture or defer the shared schema beyond a later explicitly approved module.

## M3 extension communication

M3 uses structured runtime messages and a five-second timeout. The service worker is the only component that forwards the popup request to the active tab's content script. It reinjects that script once when no receiver exists, while preserving the existing `activeTab` and `scripting` permission boundary. The content script returns metadata and a boolean readability signal only; it does not extract or retain page text.

## M5 local privacy-policy detection

M5 adds a deterministic local detector. A candidate earns confidence from explicit privacy-policy/notice labels, a privacy-oriented URL path, and—only for the current page—policy-related title/text signals. Cookie-only pages and likely blog, article, tips, guide, news, and marketing links are excluded. Scores are capped at 100, duplicate resolved URLs keep the highest-scoring candidate, and results use descending confidence followed by URL as a stable tie-breaker. The content script retains and returns only the ranked candidate metadata; it never sends full page text or the page link list to the backend.
