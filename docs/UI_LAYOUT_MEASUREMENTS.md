# UI layout measurements

## Desktop

- top bar: 68 px;
- left rail: 88 px;
- right operation sheet: 410 px at `>= 1240px`;
- bottom bar: existing application footer height;
- map fills the remaining flex area;
- terrain switcher: 154 px wide, 16 px inset;
- zoom controls: 36 px square controls, 16 px inset;
- filters: 288 px panel with a viewport-bounded scroll area.

## Breakpoints

- `1380px`: dossier sidebar and spacing tighten;
- `1240px`: operation sheet is hidden;
- `900px`: dossier home becomes a single-column document;
- `640px`: play navigation moves to a 58 px bottom rail and top bar becomes
  56 px high.

## Map capture viewports

Acceptance screenshots cover 1920×1080, 1440×900, 1280×720, 1024×768 and
390×844. Canvas DPR is capped at 2 in the application; the deterministic
capture script uses DPR 1.
