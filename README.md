# Mosaic Maker

Static web app for designing tile mosaics and exporting PNG textures for [Sweet Home 3D](https://www.sweethome3d.com/).

Stack: HTML, CSS, JavaScript (SVG). No build step, no backend.

## Screenshot

![Alt text](/docs/screenshot_mosaicmaker.png?raw=true "Screenshot of Mosaicmaker")

## Features

- Floor plan rectangle (cm), **offset** and **rotation** for Sweet Home 3D alignment
- Grid layouts: **square**, **flat-top hexagon**, **octagon + 45° filler squares**
- **Tile catalog**: import images, paint with flip / rotate (↔ ↕ ↻)
- Solid **color swatches** or catalog tiles as brush
- **Zoom**, **pan**, right-click **undo** per cell
- **Save / load** `.mosaic.json` — settings, grid, **embedded catalog as base64**

## Run locally

Open `index.html` in your favorite browser.

## Sweet Home 3D

1. Design the mosaic and click **Download PNG**.
2. Import texture in Sweet Home 3D at the room size shown in the app (cm).

## Layout

```
index.html
css/style.css
js/cell.js          Cell model (color | image ref)
js/catalog.js       In-memory catalog + base64 I/O
js/tile-grids.js    Geometry + SVG rendering
js/project-io.js    .mosaic.json v1 / v2
js/mosaic.js        UI
```

## Project file (`.mosaic.json`)

**Version 2** (current): optional `catalog` with embedded images; grid cells are colors or image refs.

| Key | Meaning |
|-----|---------|
| `v` | `2` (v1 color-only files still load) |
| `catalog` | `[[id, name, mime, base64], ...]` |
| `brush` | Optional `[tileId, flipH, flipV, rot]` |
| `grid` | `[cols, rows, cells[, fillers]]` |
| cell | `"#rrggbb"` or `[tileId, flipH, flipV, rot]` |

Example cell with image:

```json
["t-abc123", 0, 1, 90]
```

Version 1 projects (only `#hex` in grid) still open; re-save to embed a catalog.

## Sharing

Saving a project copies every catalog image into the JSON as base64, so one file is enough to share the full mosaic on another machine.

## TODO

- Edit multiple mosaics in tabs.
- Export multiple mosaics in a Sweet Home 3D Texture (SH3T) file for group import.