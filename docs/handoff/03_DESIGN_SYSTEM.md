# 03. Design system

## Direction
Quiet, direct, spacious. Typography and hierarchy before decoration. No gradients, chart walls, oversized metrics or decorative AI icons. Product brand: teamspace. with a small accent dot. System fonts only; no external font dependency.

## Proposed tokens derived from the screenshot and existing prototype
These are implementation targets, not measured pixel samples.

```css
:root {
  --bg: #15181e;
  --surface: #20252e;
  --surface-raised: #252c38;
  --text: #edf0f6;
  --muted: #a8b1c2;
  --border: #394150;
  --accent: #9dbbff;
  --primary-bg: #e4eaf6;
  --primary-text: #152039;
  --warning-bg: #3a321d;
  --warning-text: #eddbab;
  --radius-control: 12px;
  --radius-card: 18px;
  --radius-panel: 0px;
}
[data-theme='light'] {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-raised: #eef1f5;
  --text: #17202f;
  --muted: #667085;
  --border: #e2e5eb;
  --accent: #245bd6;
  --primary-bg: #17202f;
  --primary-text: #ffffff;
}
```

Font stack: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif. Base 14px, line-height 1.5. Page title 30-36px desktop, 26-28px mobile. Section heading 17-20px. Metadata 11-12px. Labels 12px. Do not shrink important controls to match screenshot scaling.

## Layout
Desktop sidebar approximately 224-240px; main offset matches sidebar. Main horizontal padding 32-40px, capped content width approximately 1500px. Sidebar: brand, four nav items, project shortcuts, new project, demo user or actual account, backup/settings. Header: team label + current destination + primary action.

Cards: 20-24px padding, 1px border, subtle or no shadow in dark theme. Gap 16-24px. Kanban: four equal columns desktop; two on medium screens; one on narrow screens. Avoid page-level horizontal overflow at 320px.

Task editor: right-hand sheet, maximum width approximately 560-600px, full height, scrollable content, overlay backdrop. On mobile full width. Keep save/cancel reachable without trapping content behind the footer. Focus moves into panel and returns to opener.

## Interaction and accessibility
- Minimum practical touch target 44px for primary interactions.
- Focus-visible ring; labels never replaced by placeholders.
- Status must be conveyed by text, not color alone.
- Verify contrast in both themes with automated and manual checks.
- Use reduced-motion preferences; optional 120-180ms transitions, no essential animation.
- Icon buttons have Danish accessible names.
- Native select or accessible equivalent; keyboard alternative for every drag action.
- Dialog traps focus, Escape invokes unsaved-change handling, backdrop does not silently discard.

## Required visual states
Default, hover, focus, disabled, loading, empty, validation error, failed save, stale edit conflict, archived, storage unavailable. Disabled controls must explain why when not obvious. Never disable Save because project is empty.
