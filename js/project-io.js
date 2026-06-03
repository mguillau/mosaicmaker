/**
 * Mosaic project file format (compact JSON, .mosaic.json).
 * v1: color strings only. v2: embedded catalog (base64) + image cell refs.
 */
(function (global) {
  "use strict";

  const VERSION = 2;
  const VERSION_LEGACY = 1;
  const MODES = ["square", "hex", "octagon"];
  const Cell = global.MosaicCell;
  const Catalog = global.MosaicCatalog;

  function num(v, fallback) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new Error("Invalid project: " + name + " must be an array.");
    return v;
  }

  function cloneCellGrid(grid) {
    return grid.map(function (row) {
      return row.map(function (cell) {
        return Cell.encode(cell);
      });
    });
  }

  function parseCellGrid(raw, rows, cols, groutHex, name) {
    const grid = requireArray(raw, name);
    if (grid.length !== rows) {
      throw new Error(
        "Invalid project: " + name + " has " + grid.length + " rows, expected " + rows + "."
      );
    }
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = requireArray(grid[r], name + " row " + r);
      if (row.length !== cols) {
        throw new Error(
          "Invalid project: row " + r + " has " + row.length + " cols, expected " + cols + "."
        );
      }
      const outRow = [];
      for (let c = 0; c < cols; c++) {
        outRow.push(Cell.decode(row[c], groutHex));
      }
      out.push(outRow);
    }
    return out;
  }

  function encode(settings, grid, ppi, catalog) {
    const groutHex = settings.groutColor;
    const payload = {
      v: VERSION,
      room: [settings.roomW, settings.roomH],
      align: [settings.offsetX, settings.offsetY, settings.rotation],
      layout: settings.mode,
      tiles: [
        settings.tile,
        settings.grout,
        settings.groutColor,
        settings.cornerCut,
      ],
      ppi: ppi,
      paint: settings.paintColor,
      grid: [grid.cols, grid.rows, cloneCellGrid(grid.cells)],
    };
    if (grid.fillers && grid.fillers.length > 0) {
      payload.grid.push(cloneCellGrid(grid.fillers));
    }
    if (catalog && catalog.order.length > 0) {
      payload.catalog = Catalog.toProjectArray(catalog);
    }
    if (settings.brushTileId) {
      payload.brush = [
        settings.brushTileId,
        settings.brushFlipH ? 1 : 0,
        settings.brushFlipV ? 1 : 0,
        settings.brushRot || 0,
      ];
    }
    return payload;
  }

  function encodeText(settings, grid, ppi, catalog, pretty) {
    return JSON.stringify(encode(settings, grid, ppi, catalog), null, pretty ? 2 : 0);
  }

  function decode(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid project: root must be a JSON object.");
    }
    const version = data.v;
    if (version !== VERSION && version !== VERSION_LEGACY) {
      throw new Error(
        "Unsupported project version " + version + " (expected " + VERSION + " or " + VERSION_LEGACY + ")."
      );
    }

    const room = requireArray(data.room, "room");
    const align = requireArray(data.align, "align");
    const layout = data.layout;
    if (MODES.indexOf(layout) < 0) {
      throw new Error("Invalid project: layout must be square, hex, or octagon.");
    }
    const tiles = requireArray(data.tiles, "tiles");
    const gridRaw = requireArray(data.grid, "grid");
    const cols = Math.max(1, Math.floor(num(gridRaw[0], 1)));
    const rows = Math.max(1, Math.floor(num(gridRaw[1], 1)));
    const groutHex = Cell.normalizeHex(tiles[2], "#c8c4bc");

    let cells;
    if (version === VERSION_LEGACY) {
      cells = parseCellGridLegacy(gridRaw[2], rows, cols, groutHex);
    } else {
      cells = parseCellGrid(gridRaw[2], rows, cols, groutHex, "grid cells");
    }

    let fillers = null;
    if (gridRaw.length >= 4 && gridRaw[3] != null) {
      const fRows = Math.max(0, rows - 1);
      const fCols = Math.max(0, cols - 1);
      if (fRows > 0 && fCols > 0) {
        fillers =
          version === VERSION_LEGACY
            ? parseCellGridLegacy(gridRaw[3], fRows, fCols, groutHex)
            : parseCellGrid(gridRaw[3], fRows, fCols, groutHex, "grid fillers");
      }
    }

    const catalog = data.catalog
      ? Catalog.fromProjectArray(data.catalog)
      : Catalog.create();

    let brushTileId = null;
    let brushFlipH = false;
    let brushFlipV = false;
    let brushRot = 0;
    if (Array.isArray(data.brush) && data.brush.length >= 1) {
      brushTileId = String(data.brush[0]);
      brushFlipH = !!data.brush[1];
      brushFlipV = !!data.brush[2];
      brushRot = parseInt(data.brush[3], 10) || 0;
    }

    return {
      settings: {
        roomW: Math.max(10, num(room[0], 300)),
        roomH: Math.max(10, num(room[1], 200)),
        offsetX: num(align[0], 0),
        offsetY: num(align[1], 0),
        rotation: num(align[2], 0),
        mode: layout,
        tile: Math.max(0.1, num(tiles[0], 11)),
        grout: Math.max(0, num(tiles[1], 0.2)),
        groutColor: groutHex,
        cornerCut: Math.max(0, num(tiles[3], 2.5)),
        paintColor: Cell.normalizeHex(data.paint, "#2d5a7b"),
        brushTileId: brushTileId,
        brushFlipH: brushFlipH,
        brushFlipV: brushFlipV,
        brushRot: brushRot,
      },
      ppi: Math.min(40, Math.max(1, num(data.ppi, 10))),
      catalog: catalog,
      gridData: { cols, rows, cells, fillers },
    };
  }

  function parseCellGridLegacy(raw, rows, cols, groutHex) {
    const grid = requireArray(raw, "colors");
    const out = [];
    for (let r = 0; r < rows; r++) {
      const row = requireArray(grid[r], "row");
      const outRow = [];
      for (let c = 0; c < cols; c++) {
        outRow.push(Cell.color(Cell.normalizeHex(row[c], groutHex)));
      }
      out.push(outRow);
    }
    return out;
  }

  function decodeText(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("Could not parse JSON: " + e.message);
    }
    return decode(data);
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function suggestedFilename(settings) {
    const now = new Date();
    const safeNowStr = (
            now
            .toISOString()
            .split(".")[0]
            .replaceAll(":", "-")
    )
    return (
      "mosaic-" +
      Math.round(settings.roomW) +
      "x" +
      Math.round(settings.roomH) +
      "." +
      safeNowStr +
      ".mosaic.json"
    );
  }

  global.MosaicProject = {
    VERSION,
    EXT: ".mosaic.json",
    encode,
    encodeText,
    decode,
    decodeText,
    downloadText,
    suggestedFilename,
  };
})(typeof window !== "undefined" ? window : globalThis);
