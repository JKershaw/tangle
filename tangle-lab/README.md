# Tangle Pocket Lab — complete project bundle

Open `tangle-pocket-lab.html` in a JavaScript-capable browser to use the finished application. No build is needed. Simulation works offline; live mode requires WebGPU, a separate model download and Wikipedia connectivity.

## Contents

- `tangle-pocket-lab.html`: the delivered single-file application, including research, design, validation notes and third-party notices.
- `tangle-lab/`: editable JavaScript, styles, HTML template, build script, dependency lockfile and tests.
- `browser-agent-reference/`: source snapshot of JKershaw/Browser-agent at commit `68d7f4c263d8ca20613bd2ed231035d3ed343678`. The build imports its engine, capability/storage helpers and Wikipedia tool. Keep this directory beside `tangle-lab/`.
- `starter-scaffolding/`: the original AGENTS guidance, decisions, non-goals, open questions, experiment conventions, TODO and tiny repository fixture. These are early project guidance, not the current implementation status.
- `previews/`: phone and desktop screenshots from validation; some predate small layout/copy refinements.
- `earlier-prototype/`: the original in-conversation simulation fragment, retained for reference. It requires its host's styles and is not the standalone app.

Installed dependencies, browser binaries, model weights, caches and Git metadata are omitted. The pinned Browser-agent source and relevant licence notices are included.

## Edit, test and rebuild

Use Node.js 22 or later. From the extracted bundle:

```sh
cd tangle-lab
npm ci
npm test
npm run build
```

The build replaces `tangle-pocket-lab.html` in the parent directory. Source files are under `src/`; the surrounding document and research notes are in `template.html`.

## Optional browser checks

The browser scripts use Playwright. Install it separately when you want to run them:

```sh
npm install --no-save playwright@1.62.1
npx playwright install chromium
node test/browser.mjs
node test/interactions.mjs
node test/wiki-browser.mjs
```

Run these commands from `tangle-lab/`. The scripts locate the built HTML relative to their own location and write screenshots to `previews/`. Set `TANGLE_BROWSER_EXECUTABLE` if you need to use an existing compatible Chromium executable. `TANGLE_BROWSER_PROXY` optionally configures a test-browser proxy; it is not a setting in the delivered application.

`wiki-browser.mjs` attempts a real public Wikipedia lookup, reports the result, then checks the integration using controlled API responses. A passing controlled test is not proof that the real lookup succeeded.

`test/unpack-browser.mjs` is an optional Linux troubleshooting helper retained from development. It requires `@sparticuz/chromium@153.0.0` and `tar`; normal Playwright installations do not need it.

## Verification and limitations

Fifteen deterministic graph/runner tests passed. Browser checks covered file-origin startup, offline simulation, three scenarios, cancellation and pause, touch selection, pan/zoom, export/import, unsafe URL rejection, mode separation, missing-GPU recovery and mobile/desktop layouts.

The development machine had no usable WebGPU adapter. Real model inference and a complete live run on a physical phone remain unverified. Wikipedia endpoints responded to an HTTP client, but real requests from the development browser failed; controlled browser-tool tests passed. Use the app's device and Wikipedia checks on your phone.

Browser-agent's existing benchmark results do not establish the reliability of the new Tangle decomposition prompts. Simulated responses and source paragraphs are authored fixtures, not measurements from a real model run.
