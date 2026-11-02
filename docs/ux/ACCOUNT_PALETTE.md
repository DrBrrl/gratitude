# Account accent palette

The user supplied these fourteen written hex values in [the reference image](references/account-accent-palette.png). The written values are canonical; the image’s text rendering is not used as a pixel sample.

| Choice | Hex | Saved slot |
| --- | --- | --- |
| Yellow | `#ffe100` | 0 |
| Lime | `#a4df00` | 2 |
| Green | `#15d600` | 4 |
| Sea green | `#00d660` | 6 |
| Turquoise | `#00ca94` | 8 |
| Teal | `#3fca9c` | 10 |
| Blue | `#355ce8` | 12 |
| Violet | `#7707ff` | 14 |
| Purple | `#a100ff` | 16 |
| Magenta | `#df40ff` | 18 |
| Pink | `#ff35da` | 20 |
| Red | `#d62e31` | 22 |
| Orange | `#da6709` | 24 |
| Gold | `#dda41d` | 26 |

The picker uses each exact value. Existing even-numbered account slots are retained, and each slot now displays the corresponding colour/name above; no events are rewritten. The journal’s date-based 28-colour wheel is independent and unchanged.

Highlights start at the selected colour itself, adding only enough white to meet the graphical 3:1 contrast bound on the existing conservative foggy-navigation surface. Small text has its own 4.5:1 tint. The supplied yellow needs no white mix. Glass borders, action borders, button fills and washes retain their existing mixing/opacity formulas, using the new point as their source.

The original smoke image retains its texture and luminance. An isolated CSS colour-blend layer uses the selected hex directly; a uniform 55% saturation treatment keeps the background subdued. This replaces equally spaced hue rotations, so irregularly spaced palette points use their own colour. The blend/filter affects only the background layer, not writing, photos or controls.

Selection checks use dark or white ink for readable contrast on each exact swatch; focus indicators use the readable graphical tint.
