# uma.moe design

Layout and density rules for every screen. Colours and typography are not recorded here yet; the incumbent tokens
are the authority for those until `/impeccable document` adds them.

**Never, ever use coloured-border cards.** No card, tile, legend entry or reading carries a coloured edge, stripe or
tinted border to mark its series, style or status. A series shows its colour through its own swatch: the tinted
checkbox, a dot or the line itself.

## Overview

uma.moe is a dense analysis tool for Uma Musume players. Every screen, from a 320px phone to a 1080p desktop,
stays slim: no vertical space that carries nothing, and no line break that splits a value, a label or a group of
controls.

## Components

- **Build from the UI library.** Controls come from `src/components` (browse them at `/ui`): `Button`,
  `IconButton`, `ToggleButton`, `SegmentedControl`, `Checkbox`, `FilterChip`, `SelectField`, `Tabs`, `ChartFrame`,
  `PlotZoomControls`, `DataTable` and the rest. Never hand-draw a control the library already has; size a library
  component for its feature with scoped `:global()` rules, or extend the component itself.
- **Coloured toggles are tinted checkboxes.** A toggle for a coloured category, such as a running style or a
  timeline event type, is the library `Checkbox` with `--color-accent` set to that colour.

## Layout

- **One gutter on phones.** The page frame owns the only side gutter; sections do not add a second one, and cards
  use 8px inner padding below 768px.
- **Controls on the title row.** A section's controls sit on its title row. When they do not fit, secondary options
  collapse into a menu button beside the primary control instead of wrapping onto another row.
- **One row per control group.** Segmented controls, filters and tab groups stay on one row from iPhone SE (320 to
  375px) up: give options short labels for phones, scroll the group as a last resort with its cut-off side faded, or
  turn it into a select. Two related toggles share one row.
- **One line per table row.** Tables never stack rows into label and value cards. On phones a wide table scrolls
  sideways under a pinned identity column, such as a rank with a portrait, a skill chip or a compact composition,
  that takes well under half of the visible width. Headings and cell values stay on one line; a long name in a
  pinned column truncates with an ellipsis rather than widening the column or wrapping. A table that only just
  overflows fits instead: short headings for phones and equal columns rather than a scroll of a few pixels.
- **Readable detail panels.** A row's expanded detail fits the visible width: its controls sit above its tables, and
  those tables pin short row labels beside their values like any other table.
- **Charts take the space.** Charts fill their card in both directions, and a plot keeps only the margins its labels
  need. On very small screens, axis and track labels give way so the plot gets the width.
- **One toolbar per chart.** A chart's controls share its card's toolbar row: view switches first, then the zoom
  level and reset, then Expand at the right edge, icon-only in a narrow card. A touch phone pinches to zoom, so the
  zoom steps give way there; the gesture hint becomes the zoom buttons' tooltip rather than lengthening the row.
- **The legend is the toggle.** A chart's series toggles are its legend: a grid of tinted checkboxes, split over two
  even rows on a phone (three and three, two and two), whose descriptions read out each series at the inspected
  point. There is no separate row of chips.
- **Tabs show where you are.** Tab groups that jump to page sections mark the section in view as active.
- **One control height per row.** Controls side by side share the control height: 32px on phones, and the
  `--control-height` token elsewhere. An Expand or menu button is never taller or shorter than the switch beside
  it.

## Do's and Don'ts

- Don't ever use coloured-border cards: no coloured left edge, stripe or tinted outline on any card, tile or legend.
- Don't hand-draw a button, toggle, chip or checkbox; use the library component.
- Do remove a control that cannot change anything useful for the data shown.
- Do keep explanations behind the info button; don't add hints, subtexts or footnotes under titles.
- Don't use text-styled actions; every action is a button.
- Don't let a number, name or control label wrap onto a second line.
