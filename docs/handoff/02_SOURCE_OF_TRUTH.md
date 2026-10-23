# 02. Source of truth and fidelity

## Available evidence
A. User-provided screenshot, included as reference-screen.png. It shows a dark desktop interface with sidebar, four navigation items, quick capture, area/assignee/project/search filters, Mit fokus, Det skal vi have afklaret and Alle opgaver. It also shows a local-data read error. That error is a runtime state, NOT a decorative design element.

B. Current React canvas supplied in conversation context: AI Team Space.page, code/react. It uses React, useState/useEffect, framer-motion, lucide-react and Tailwind-style classes. It is mostly light, includes project shortcuts and a right task editor. Exact excerpts are included in reference-canvas-excerpts.txt. Full source is not included.

C. Earlier generated standalone HTML was mentioned in the conversation. Retrieval failed; it is not available as an executable reference in this package. Do not claim to have copied or verified it.

## Priority when evidence conflicts
1. Explicit user requirements: project optional, named area ownership, combined filters, project kanban.
2. Current canvas information architecture and interactions, except known bugs.
3. Screenshot for dark palette, spacing character and visual composition.
4. Proposed specifications for missing production behavior.

## Concrete differences to preserve consciously
- Screenshot: dark background; canvas: light Tailwind classes. Implement both themes, dark as initial demo reference, with an explicit toggle. This default is a proposed design decision, not a claim that the canvas is dark.
- Screenshot: always-visible Alle opgaver; canvas: Mit fokus/Hele teamet and a show-all toggle. Target uses canvas focus controls and a clearly accessible all-tasks view. Do not hide blocked tasks behind an unexplained limit.
- Screenshot: no visible project shortcuts; canvas: DINE PROJEKTER. Keep canvas shortcuts.
- Screenshot: error banner. Only render on actual storage failure; never seed a fake error.
- Canvas: Sofie B. and Sofie P. aliases. Display Sofie Rasmussen and Sofie Ihle per explicit user clarification.
- Canvas: several controls are defined but not rendered. Target must render them.

## Meaning of 1:1
Faithful navigation, wording, hierarchy, card language, side-panel editing and interaction model. Not a promise of pixel identity between two conflicting source states. Deliver screenshot comparisons and explicitly list remaining visual differences. Do not invent unavailable source code or assets.

## Reference use
No screenshot image should be used as the actual app background. Rebuild real semantic controls. Do not copy the data-error banner into the normal state. All demo project owners, statuses and progress are illustrative, not verified company records.
