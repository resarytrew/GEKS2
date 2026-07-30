# UI layout measurements

Measurements are based on the shell’s CSS geometry, excluding the 52px top rail and 60px phase rail. The Canvas fills the remaining central region.

| Viewport | Sheet state | Central map width | Central map share | Notes |
|---:|---|---:|---:|---|
| 1280×720 | open (340px) | 896px after 44px tools | 70.0% width | central map height: 608px |
| 1280×720 | collapsed (44px) | 1192px after 44px tools | 93.1% width | exceeds 70% target |
| 1440×900 | open | 1056px after 44px tools | 73.3% width | central map height: 788px |
| 1440×900 | collapsed | 1352px after 44px tools | 93.9% width | exceeds 70% target |
| 1920×1080 | open | 1536px after 44px tools | 80.0% width | central map height: 968px |
| 1024×768 | open | 640px after 44px tools | 62.5% width | inspector still visible at `md`; this is usable but dense |
| 390×844 | mobile | 390px | 100% width | desktop rail/sheet are hidden; map is the primary surface |

The sheet is hidden below Tailwind `md` (768px). A dedicated mobile bottom sheet is not yet implemented; this remains a documented next UI stage. No screenshot suite is claimed by this document.
