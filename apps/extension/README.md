# Browser extension

M2 provides the Manifest V3 extension foundation: popup UI, background service worker, and on-demand content script. It does not detect or analyze privacy policies.

The built extension is in `dist/`. It requests `activeTab` and `scripting` only, allowing a content script to be injected into the tab where the user opens the extension. It has no persistent host permissions.
