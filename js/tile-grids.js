/**
 * Tile grid geometry and SVG rendering (colors + catalog images).
 */
(function (global) {
  "use strict";

  const MODES = { SQUARE: "square", HEX: "hex", OCTAGON: "octagon" };

  function Cell() {
    const C = global.MosaicCell;
    if (!C) {
      throw new Error("MosaicCell module not loaded (include js/cell.js before tile-grids.js).");
    }
    return C;
  }

  function hexHeight(w) {
    return (w * Math.sqrt(3)) / 2;
  }

  function hexCenter(col, row, w, grout) {
    const dx = w * 0.75 + grout;
    const dy = hexHeight(w) + grout;
    return {
      x: col * dx + (row & 1 ? dx / 2 : 0),
      y: row * dy,
    };
  }

  function countSquare(roomDim, tile, grout) {
    if (tile <= 0) return 0;
    if (grout <= 0) return Math.max(1, Math.floor(roomDim / tile));
    return Math.max(1, Math.floor((roomDim + grout) / (tile + grout)));
  }

  function countHex(roomW, roomH, tile, grout) {
    let cols = 0;
    let rows = 0;
    for (let c = 0; c < 500; c++) {
      const pos = hexCenter(c, 0, tile, grout);
      if (pos.x > roomW + tile) break;
      cols = c + 1;
    }
    for (let r = 0; r < 500; r++) {
      const pos = hexCenter(0, r, tile, grout);
      if (pos.y > roomH + hexHeight(tile)) break;
      rows = r + 1;
    }
    return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
  }

  function pitchSquare(tile, grout) {
    return tile + grout;
  }

  function squareOrigin(col, row, tile, grout) {
    const p = pitchSquare(tile, grout);
    return { x: col * p, y: row * p };
  }

  function octagonPoints(x, y, size, cut) {
    const c = Math.min(Math.max(0, cut), size / 2 - 0.05);
    return [
      [x + c, y],
      [x + size - c, y],
      [x + size, y + c],
      [x + size, y + size - c],
      [x + size - c, y + size],
      [x + c, y + size],
      [x, y + size - c],
      [x, y + c],
    ];
  }

  function fillerCenter(col, row, tile, grout) {
    const p = pitchSquare(tile, grout);
    const half = grout / 2;
    return {
      x: (col + 1) * p - half,
      y: (row + 1) * p - half,
    };
  }

  function fillerSide(cornerCut, grout) {
    const c = Math.max(0, cornerCut);
    return Math.max(0.1, 2 * c + grout);
  }

  function pointsToPath(points) {
    return (
      "M" +
      points
        .map(function (p, i) {
          return (i === 0 ? "" : "L") + p[0].toFixed(3) + "," + p[1].toFixed(3);
        })
        .join(" ") +
      "Z"
    );
  }

  function hexVertexPoints(cx, cy, w) {
    const r = w / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i + 30) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  function diamondPoints(cx, cy, side) {
    const h = side / 2;
    return [[cx, cy - h], [cx + h, cy], [cx, cy + h], [cx - h, cy]];
  }

  function tileShape(kind, col, row, tile, grout, cornerCut) {
    if (kind === "square") {
      const o = squareOrigin(col, row, tile, grout);
      return {
        x: o.x,
        y: o.y,
        w: tile,
        h: tile,
        d: null,
        tag: "rect",
      };
    }
    if (kind === "hex") {
      const o = hexCenter(col, row, tile, grout);
      const hh = hexHeight(tile);
      const cx = o.x + tile / 2;
      const cy = o.y + hh / 2;
      return {
        x: o.x,
        y: o.y,
        w: tile,
        h: hh,
        d: pointsToPath(hexVertexPoints(cx, cy, tile)),
        tag: "path",
      };
    }
    if (kind === "oct") {
      const o = squareOrigin(col, row, tile, grout);
      return {
        x: o.x,
        y: o.y,
        w: tile,
        h: tile,
        d: pointsToPath(octagonPoints(o.x, o.y, tile, cornerCut)),
        tag: "path",
      };
    }
    if (kind === "filler") {
      const side = fillerSide(cornerCut, grout);
      const center = fillerCenter(col, row, tile, grout);
      return {
        x: center.x - side / 2,
        y: center.y - side / 2,
        w: side,
        h: side,
        d: pointsToPath(diamondPoints(center.x, center.y, side)),
        tag: "path",
      };
    }
    return { x: 0, y: 0, w: tile, h: tile, d: null, tag: "rect" };
  }

  function clipId(kind, col, row) {
    return "clip-" + kind + "-" + col + "-" + row;
  }

  function coverSize(iw, ih, rot, boxW, boxH) {
    let dw = iw;
    let dh = ih;
    if (rot === 90 || rot === 270) {
      dw = ih;
      dh = iw;
    }
    const scale = Math.max(boxW / dw, boxH / dh);
    return { sw: iw * scale, sh: ih * scale };
  }

  function appendShape(parent, shape, fill) {
    const el =
      shape.tag === "rect"
        ? document.createElementNS("http://www.w3.org/2000/svg", "rect")
        : document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("class", "tile-shape");
    el.setAttribute("fill", fill);
    if (shape.tag === "rect") {
      el.setAttribute("x", shape.x);
      el.setAttribute("y", shape.y);
      el.setAttribute("width", shape.w);
      el.setAttribute("height", shape.h);
    } else {
      el.setAttribute("d", shape.d);
    }
    parent.appendChild(el);
    return el;
  }

  function appendTileImage(parent, cell, catalog, shape) {
    const entry = catalog.byId.get(cell.id);
    if (!entry || !entry.dataUrl) return;
    const iw = entry.w || 100;
    const ih = entry.h || 100;
    const cx = shape.x + shape.w / 2;
    const cy = shape.y + shape.h / 2;
    const cover = coverSize(iw, ih, cell.r, shape.w, shape.h);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "tile-image-wrap");
    g.setAttribute("pointer-events", "none");
    const parts = [
      "translate(" + cx + "," + cy + ")",
      cell.r ? "rotate(" + cell.r + ")" : "",
      cell.h ? "scale(-1,1)" : "",
      cell.v ? "scale(1,-1)" : "",
    ].filter(Boolean);
    g.setAttribute("transform", parts.join(" "));
    const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttributeNS("http://www.w3.org/1999/xlink", "href", entry.dataUrl);
    img.setAttribute("href", entry.dataUrl);
    img.setAttribute("x", (-cover.sw / 2).toFixed(3));
    img.setAttribute("y", (-cover.sh / 2).toFixed(3));
    img.setAttribute("width", cover.sw.toFixed(3));
    img.setAttribute("height", cover.sh.toFixed(3));
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    g.appendChild(img);
    parent.appendChild(g);
  }

  function buildTileGroup(layer, attrs) {
    const shape = attrs.shape;
    const cell = attrs.cell;
    const catalog = attrs.catalog;
    const groutHex = attrs.groutHex;
    const cid = clipId(attrs.kind, attrs.col, attrs.row);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "tile");
    g.dataset.kind = attrs.kind;
    g.dataset.col = String(attrs.col);
    g.dataset.row = String(attrs.row);
    g.setAttribute("role", "button");
    g.setAttribute("tabindex", "0");
    g.setAttribute("aria-label", attrs.label);

    const fill = Cell().fillHex(cell, groutHex);
    appendShape(g, shape, fill);

    if (Cell().isImage(cell) && catalog) {
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const cp = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
      cp.setAttribute("id", cid);
      if (shape.tag === "rect") {
        const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r.setAttribute("x", shape.x);
        r.setAttribute("y", shape.y);
        r.setAttribute("width", shape.w);
        r.setAttribute("height", shape.h);
        cp.appendChild(r);
      } else {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", shape.d);
        cp.appendChild(p);
      }
      defs.appendChild(cp);
      g.appendChild(defs);

      const clipped = document.createElementNS("http://www.w3.org/2000/svg", "g");
      clipped.setAttribute("clip-path", "url(#" + cid + ")");
      clipped.setAttribute("pointer-events", "none");
      appendTileImage(clipped, cell, catalog, shape);
      g.appendChild(clipped);
    }

    const hit = appendShape(g, shape, "#000000");
    hit.setAttribute("class", "tile-hit");
    hit.setAttribute("fill-opacity", "0");
    hit.setAttribute("stroke", "none");

    layer.appendChild(g);
    return g;
  }

  function createGrid(mode, roomW, roomH, tile, grout, cornerCut, groutHex) {
    const g = groutHex || "#c8c4bc";
    if (mode === MODES.HEX) {
      const { cols, rows } = countHex(roomW, roomH, tile, grout);
      return {
        mode,
        cols,
        rows,
        fillers: null,
        cells: empty2d(rows, cols, Cell().grout(g)),
      };
    }
    if (mode === MODES.OCTAGON) {
      const cols = countSquare(roomW, tile, grout);
      const rows = countSquare(roomH, tile, grout);
      const fRows = Math.max(0, rows - 1);
      const fCols = Math.max(0, cols - 1);
      return {
        mode,
        cols,
        rows,
        fillers: empty2d(fRows, fCols, Cell().grout(g)),
        cells: empty2d(rows, cols, Cell().grout(g)),
      };
    }
    const cols = countSquare(roomW, tile, grout);
    const rows = countSquare(roomH, tile, grout);
    return {
      mode: MODES.SQUARE,
      cols,
      rows,
      fillers: null,
      cells: empty2d(rows, cols, Cell().grout(g)),
    };
  }

  function empty2d(rows, cols, val) {
    const a = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(Cell().clone(val));
      a.push(row);
    }
    return a;
  }

  function mergeCells(grid, old, groutHex, preserve) {
    const g = Cell().grout(groutHex);
    if (old && old.colors && !old.cells) {
      old = { cells: old.colors, fillers: old.fillers };
    }
    if (!preserve || !old) {
      fill2d(grid.cells, g);
      if (grid.fillers) fill2d(grid.fillers, g);
      return;
    }
    copy2d(grid.cells, old.cells, g);
    if (grid.fillers && old.fillers) {
      copy2d(grid.fillers, old.fillers, g);
    } else if (grid.fillers) {
      fill2d(grid.fillers, g);
    }
  }

  function fill2d(arr, cell) {
    for (let r = 0; r < arr.length; r++) {
      for (let c = 0; c < arr[r].length; c++) arr[r][c] = Cell().clone(cell);
    }
  }

  function copy2d(dest, src, fallback) {
    for (let r = 0; r < dest.length; r++) {
      for (let c = 0; c < dest[r].length; c++) {
        dest[r][c] =
          src[r] && src[r][c] !== undefined && src[r][c] !== null
            ? Cell().clone(src[r][c])
            : Cell().clone(fallback);
      }
    }
  }

  function patternSize(grid, tile, grout) {
    if (grid.mode === MODES.HEX) {
      const last = hexCenter(grid.cols - 1, grid.rows - 1, tile, grout);
      return { w: last.x + tile, h: last.y + hexHeight(tile) };
    }
    const usedW = grid.cols * tile + Math.max(0, grid.cols - 1) * grout;
    const usedH = grid.rows * tile + Math.max(0, grid.rows - 1) * grout;
    return { w: usedW, h: usedH };
  }

  function renderTiles(grid, layer, tile, grout, cornerCut, catalog, groutHex) {
    if (!layer) return;
    layer.replaceChildren();

    function draw(kind, col, row, cell, label) {
      const shape = tileShape(kind, col, row, tile, grout, cornerCut);
      buildTileGroup(layer, {
        kind: kind,
        col: col,
        row: row,
        cell: cell,
        shape: shape,
        catalog: catalog,
        groutHex: groutHex,
        label: label,
      });
    }

    if (grid.mode === MODES.SQUARE) {
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          draw("square", c, r, grid.cells[r][c], "Tile " + (c + 1) + "," + (r + 1));
        }
      }
      return;
    }
    if (grid.mode === MODES.HEX) {
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          draw("hex", c, r, grid.cells[r][c], "Hex " + (c + 1) + "," + (r + 1));
        }
      }
      return;
    }
    if (grid.mode === MODES.OCTAGON) {
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          draw("oct", c, r, grid.cells[r][c], "Octagon " + (c + 1) + "," + (r + 1));
        }
      }
      if (grid.fillers) {
        for (let r = 0; r < grid.fillers.length; r++) {
          for (let c = 0; c < grid.fillers[r].length; c++) {
            draw(
              "filler",
              c,
              r,
              grid.fillers[r][c],
              "Filler " + (c + 1) + "," + (r + 1)
            );
          }
        }
      }
    }
  }

  function getCell(grid, kind, col, row) {
    if (kind === "filler" && grid.fillers) return grid.fillers[row][col];
    return grid.cells[row][col];
  }

  function setCell(grid, kind, col, row, cell) {
    if (kind === "filler" && grid.fillers) {
      if (row >= 0 && row < grid.fillers.length && col >= 0 && col < grid.fillers[0].length) {
        grid.fillers[row][col] = Cell().clone(cell);
        return true;
      }
      return false;
    }
    if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols) {
      grid.cells[row][col] = Cell().clone(cell);
      return true;
    }
    return false;
  }

  function tileCountLabel(grid) {
    if (grid.mode === MODES.OCTAGON && grid.fillers) {
      const nF = grid.fillers.length * (grid.fillers[0]?.length || 0);
      return grid.cols + "×" + grid.rows + " octagons, " + nF + " fillers";
    }
    return grid.cols + " × " + grid.rows;
  }

  global.TileGrids = {
    MODES,
    createGrid,
    mergeCells,
    mergeColors: mergeCells,
    patternSize,
    renderTiles,
    getCell,
    setCell,
    getCellColor: getCell,
    setCellColor: setCell,
    tileCountLabel,
    countSquare,
    tileShape,
    buildTileGroup,
  };
})(typeof window !== "undefined" ? window : globalThis);
