# Agent guidance — ChatGPT Apps (UX, UI, components)

When designing or implementing app UI in this project, **treat these OpenAI Apps SDK docs as the source of truth** (read them before large UI or tool-surface changes):

1. **[UX principles](https://developers.openai.com/apps-sdk/concepts/ux-principles)** — what makes an app a good fit for ChatGPT  
2. **[UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)** — display modes, layout, and visual system  
3. **[Design components](https://developers.openai.com/apps-sdk/plan/components)** — planning components, data contracts, and state  

---

## UX principles (apply to every feature)

From [UX principles](https://developers.openai.com/apps-sdk/concepts/ux-principles):

- **Extract, don’t port** — Ship a few **atomic, model-friendly tools** with minimal inputs/outputs; do not mirror a full website or native app.
- **Design for conversational entry** — Support open-ended prompts, direct commands, and first-run clarity.
- **Design for the ChatGPT environment** — ChatGPT owns the conversational surface; your UI should **clarify actions, capture inputs, or show structured results**. Drop ornamental UI that does not advance the task.
- **Optimize for conversation, not navigation** — Prefer declarative tool actions, concise structured responses, and follow-ups that keep the user in flow (not dashboards or deep app chrome).
- **Embrace the ecosystem** — Leverage natural language, thread context, and (when helpful) composition with other apps.

**Avoid:** long-form or static web content, workflows that do not fit inline/fullscreen/PiP, ads or irrelevant messaging, sensitive data exposed casually in cards, **duplicating ChatGPT system UI** (e.g. rebuilding the composer).

**Publishing mindset:** Favor conversational value, atomic tools, UI that is genuinely better than plain text, in-chat task completion, responsiveness, and clear discoverability from prompts. Then polish UI per [UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines).

---

## UI guidelines (layout, modes, visuals)

From [UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines):

### Design system

- Prefer the **Apps SDK UI** design system (Tailwind, CSS variable tokens, accessible components) for speed and consistency with ChatGPT. It is **recommended, not mandatory**.
- For visual design exploration, use OpenAI’s **Figma component library** as referenced in the doc.

### Display modes

- **Inline** — Default. Appears in-thread **before** the model reply. Structure: app label/icon → inline content → model follow-up (non-redundant with the card).
- **Inline card** — Single-purpose, lightweight. **Max two primary actions** at the bottom (one primary, one optional secondary); actions should drive a **conversation turn or tool call**. **No** deep navigation, tabs, or multiple drill-ins inside one card. **No nested scrolling** — card grows up to mobile viewport height. **No** duplicative ChatGPT inputs/features.
- **Inline carousel** — **3–8 items**; each item needs a visual; **≤~3 lines** metadata; **one optional CTA** per item when needed; consistent hierarchy.
- **Fullscreen** — For rich or multi-step work that cannot fit a card; **system composer stays** — design so follow-up prompts and tool calls still make sense.
- **Picture-in-picture (PiP)** — For **parallel** activities (games, video, live sessions) that can **react to chat**; keep controls minimal; **end session** should return to inline and dismiss PiP.

### Visual design

- **Color** — System colors for text, icons, dividers. **Brand only as accents** (e.g. logos, icons, imagery); do **not** override core text/background system styles or add noisy gradients.
- **Typography** — **System font stack** (e.g. SF Pro / Roboto); limited size scale; partner styling only inside content, not structural chrome.
- **Spacing & layout** — System grid spacing, consistent padding, respect system radii, clear headline → supporting text → CTA order.
- **Icons & imagery** — System or ChatGPT-aligned monochrome/outline icons; **do not** embed your logo inside the widget body (host shows app branding). Respect enforced **aspect ratios** for images.
- **Accessibility** — WCAG AA contrast, alt text, layouts that survive text resizing.

---

## Design components (planning & implementation contract)

From [Design components](https://developers.openai.com/apps-sdk/plan/components):

### Clarify each component

- **Viewer vs editor** — read-only vs write-back.
- **Single-shot vs multiturn** — one invocation vs persistent state across turns.
- **Inline vs fullscreen vs PiP** — sketch states before coding.

### Data & bridge

- Components should get what they need from the **tool response** (`structuredContent`). Render from the latest tool result over the MCP Apps bridge; on UI-initiated calls, render from **`tools/call`** results. Use **`ui/update-model-context`** when the model must see UI state.
- Define **JSON shape**, **empty states**, and **auth/display** rules up front.

### Layout & quality

- Iframe runs on **desktop and mobile**: max width, collapsing layouts, **dark mode** (`color-scheme`), focus states, visible navigation when expanding to fullscreen.

### State contract

- **Model-visible UI state** → `ui/update-model-context`. Optional ChatGPT-persisted widget-only state → `window.openai.setWidgetState` when appropriate.
- **Authoritative data** lives on server/storage; define how new tool results merge into UI state.
- Use **`ui/message`** when the transcript should record a meaningful human-readable update from the UI.

### Operations

- Plan **telemetry** (loads, clicks, errors) correlated with **tool-call IDs**, and **fallbacks** if the component fails (e.g. show structured JSON + retry path).

Reference examples (e.g. Pizzaz gallery) via the links in [Design components](https://developers.openai.com/apps-sdk/plan/components).

---

## This repository

Local prototypes may use a full-page “ChatGPT-like” shell. **Production-oriented widgets** should still obey the contracts above: they must work **inside the iframe**, respect **inline/fullscreen/PiP** expectations, and stay aligned with [UX principles](https://developers.openai.com/apps-sdk/concepts/ux-principles), [UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines), and [Design components](https://developers.openai.com/apps-sdk/plan/components).

For wiring details (MCP bridge, `window.openai`, bundling), use [Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui) as a **technical** supplement—not a substitute for the three pages above.

### Local copy: OpenAI Apps SDK examples

A vendored copy of the official **Apps SDK Examples Gallery** (widgets + sample MCP servers) lives next to this app:

`openai-apps-sdk-examples/` (repository root, sibling of `chatgpt-app/`)

Use it for Pizzaz (list, carousel, map, shop, albums), kitchen-sink-lite, shopping cart, solar-system, auth samples, and Node/Python server patterns. See that folder’s `README.md` for `pnpm install`, `build-all.mts`, and server run instructions. It is **reference-only**—not wired into the Vite shell unless you integrate it explicitly.
