# Privacy Intelligence Platform

> Read the Privacy Policy. Understand the Risk. Protect the User.

An evidence-first browser extension and backend that will help people understand a website's stated privacy practices. The current repository includes a minimal browser-extension foundation and a backend health endpoint; it does not yet analyze policies.

## Technology stack

- **TypeScript** across the backend, extension, and shared package for stable contracts.
- **Chrome/Chromium Manifest V3** for the extension, using only temporary active-tab access and script injection.
- **Fastify** for a small, typed REST API suitable for future service integration.
- **Vitest** for fast backend unit/API tests.
- **npm workspaces** to keep extension, backend, and shared code separated without a monorepo tool dependency.

React and Vite are suitable future choices for the popup UI, but are intentionally deferred until an extension UI module is approved.

## Prerequisites

- Node.js 20.19 or later
- npm 10 or later

## Setup

```bash
npm install
copy apps\\backend\\.env.example apps\\backend\\.env
copy apps\\extension\\.env.example apps\\extension\\.env
```

On macOS/Linux, use `cp apps/backend/.env.example apps/backend/.env` and `cp apps/extension/.env.example apps/extension/.env`. The default backend configuration runs on port `3000`.

## Development and checks

```bash
npm run dev:backend
npm run test
npm run typecheck
npm run build
```

## Build and load the extension

Build the extension from the repository root:

```bash
npm run build --workspace=@privacy-intelligence/extension
```

Then load it in Chrome or Chromium:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `apps/extension/dist`.
5. Open an ordinary `http` or `https` webpage, click the Privacy Intelligence extension icon, and verify the popup shows its title, domain, URL, and the **Extension is ready** status.
6. Click **Analyze Page**. Verify the status changes to **Page information received** and the result reports whether readable page text is available.
7. Open a restricted browser page such as `chrome://extensions`, then open the popup. Verify it shows an accessible error instead of crashing.

The popup sends `ANALYZE_PAGE` to the service worker, which sends `GET_PAGE_INFO` to the on-demand content script and returns the structured result to the popup. The content script is injected only after the popup opens on the active supported page. Use the service worker link on the extension's `chrome://extensions` card and the page's DevTools console to check for errors.

Start the backend with `npm run dev:backend` before testing **Analyze Page**. After the local page-information result appears, the popup separately displays the backend response. Stop the backend and click **Analyze Page** again to verify the controlled backend connection error.

## Test local privacy-policy detection

Click **Find Privacy Policy** on a normal `http` or `https` webpage. Detection runs locally in the content script and does not send page text or links to the backend. The popup displays whether a policy was found, the best candidate URL, confidence, and reason. Test a policy page directly, a site homepage with a policy-footer link, and a page with no policy link. On a restricted browser page, confirm the existing controlled inaccessible-page error appears.

## Test privacy-policy extraction

Keep the backend running, click **Find Privacy Policy**, then click **Extract Selected Policy**. The extension sends only the selected policy URL to `POST /api/v1/policy/extract`. The popup displays the extracted title, word count, final URL, and a short preview. Reload the unpacked extension after each build. Test a valid public policy page and an extraction failure (for example, stop the backend) to confirm the controlled error state.

The extraction response is also processed into stable sections and bounded chunks on the backend. The popup shows only the structured summary: total words, section count, chunk count, and section headings; it does not display the full processed policy.

With the backend running, verify it with:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","service":"privacy-intelligence-backend"}
```

## Repository layout

```text
apps/
  backend/       Fastify REST API and its tests
  extension/     Manifest V3 popup, service worker, and content-script foundation
packages/
  shared/        Future cross-project types and utilities
tests/           Reserved for cross-project test fixtures and integration tests
docs/            Technical decisions and project documentation
```

## Environment configuration

The backend reads `PORT` and `HOST` from its environment. The extension build reads `EXTENSION_BACKEND_BASE_URL` from `apps/extension/.env` and embeds it in the generated extension; it contains no secrets. The default URL is `http://127.0.0.1:3000`. If that host or port changes, update both the extension `.env` value and the narrowly scoped `host_permissions` entry in `apps/extension/public/manifest.json`, then rebuild and reload the extension. Never commit `.env` files.

## Current status

See [PROJECT_STATUS.md](PROJECT_STATUS.md). The next module begins only after the extension foundation is fully validated.
