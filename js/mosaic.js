/**
 * Mosaic Maker — UI, viewport, transforms, export.
 */
(function () {
  "use strict";

  const TG = window.TileGrids;
  const MP = window.MosaicProject;
  const Cell = window.MosaicCell;
  const Catalog = window.MosaicCatalog;
  const PRESET_COLORS = [
    "#2d5a7b",
    "#8b3a3a",
    "#4a6741",
    "#c4a35a",
    "#e8e4dc",
    "#1a1a18",
    "#6b5b73",
    "#c17f59",
  ];

  const LAYOUT_HINTS = {
    square: "Square grid with grout gaps.",
    hex: "Flat-top hexagons; tile size is flat-to-flat width.",
    octagon:
      "Squares with cut corners; small squares (45°) fill the gaps. Adjust corner cut to resize fillers.",
  };

  const els = {
    roomWidth: document.getElementById("room-width"),
    roomHeight: document.getElementById("room-height"),
    offsetX: document.getElementById("offset-x"),
    offsetY: document.getElementById("offset-y"),
    rotation: document.getElementById("rotation"),
    tileSize: document.getElementById("tile-size"),
    cornerCut: document.getElementById("corner-cut"),
    fieldCornerCut: document.getElementById("field-corner-cut"),
    groutWidth: document.getElementById("grout-width"),
    groutColor: document.getElementById("grout-color"),
    paintColor: document.getElementById("paint-color"),
    exportPpi: document.getElementById("export-ppi"),
    btnRebuild: document.getElementById("btn-rebuild"),
    btnExport: document.getElementById("btn-export"),
    btnSave: document.getElementById("btn-save"),
    btnLoad: document.getElementById("btn-load"),
    loadFile: document.getElementById("load-file"),
    projectStatus: document.getElementById("project-status"),
    btnFillGrout: document.getElementById("btn-fill-grout"),
    btnZoomIn: document.getElementById("btn-zoom-in"),
    btnZoomOut: document.getElementById("btn-zoom-out"),
    btnZoomReset: document.getElementById("btn-zoom-reset"),
    gridInfo: document.getElementById("grid-info"),
    exportHint: document.getElementById("export-hint"),
    layoutHint: document.getElementById("layout-hint"),
    swatches: document.getElementById("swatches"),
    svg: document.getElementById("mosaic"),
    canvasWrap: document.getElementById("canvas-wrap"),
    roomBg: document.getElementById("room-bg"),
    clipRect: document.getElementById("clip-rect"),
    patternRoot: document.getElementById("pattern-root"),
    tilesLayer: document.getElementById("tiles-layer"),
    cursorPos: document.getElementById("cursor-pos"),
    gridModeRadios: document.querySelectorAll('input[name="grid-mode"]'),
    panel: document.getElementById("panel"),
    btnPanelToggle: document.getElementById("btn-panel-toggle"),
    gallery: document.getElementById("gallery"),
    btnImportTile: document.getElementById("btn-import-tile"),
    importTileFile: document.getElementById("import-tile-file"),
    tileTransform: document.getElementById("tile-transform"),
    btnFlipH: document.getElementById("btn-flip-h"),
    btnFlipV: document.getElementById("btn-flip-v"),
    btnRot: document.getElementById("btn-rot"),
  };

  const catalog = Catalog.create();
  let brush = { mode: "color" };

  let grid = TG.createGrid(TG.MODES.SQUARE, 300, 200, 11, 0.2, 2.5, "#c8c4bc");

  const view = {
    x: 0,
    y: 0,
    w: 300,
    h: 200,
  };

  let painting = false;
  let panning = false;
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };
  let hoveredTile = null;
  /** @type {Map<string, object[]>} */
  const undoStacks = new Map();

  function readNum(input, fallback) {
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function readSigned(input, fallback) {
    const n = parseFloat(input.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function getMode() {
    const checked = document.querySelector('input[name="grid-mode"]:checked');
    return checked ? checked.value : TG.MODES.SQUARE;
  }

  function getSettings() {
    return {
      roomW: Math.max(10, readNum(els.roomWidth, 300)),
      roomH: Math.max(10, readNum(els.roomHeight, 200)),
      offsetX: readSigned(els.offsetX, 0),
      offsetY: readSigned(els.offsetY, 0),
      rotation: readSigned(els.rotation, 0),
      mode: getMode(),
      tile: readNum(els.tileSize, 11),
      cornerCut: Math.max(0, readNum(els.cornerCut, 2.5)),
      grout: Math.max(0, readNum(els.groutWidth, 0.2)),
      groutColor: els.groutColor.value,
      paintColor: els.paintColor.value,
      brushTileId: brush.mode === "tile" ? brush.id : null,
      brushFlipH: brush.mode === "tile" ? !!brush.h : false,
      brushFlipV: brush.mode === "tile" ? !!brush.v : false,
      brushRot: brush.mode === "tile" ? brush.r || 0 : 0,
    };
  }

  function brushCell() {
    if (brush.mode === "tile" && brush.id) {
      return Cell.image(brush.id, brush.h, brush.v, brush.r);
    }
    return Cell.color(els.paintColor.value);
  }

  function setColorBrush() {
    brush = { mode: "color" };
    els.tileTransform.hidden = true;
    updateSwatchActive();
    renderGallery();
  }

  function setTileBrush(id, h, v, r) {
    brush = {
      mode: "tile",
      id: id,
      h: !!h,
      v: !!v,
      r: r || 0,
    };
    els.tileTransform.hidden = false;
    updateSwatchActive();
    renderGallery();
  }

  function updateModeUi() {
    const mode = getMode();
    const isOct = mode === TG.MODES.OCTAGON;
    els.fieldCornerCut.hidden = !isOct;
    els.layoutHint.textContent = LAYOUT_HINTS[mode] || "";
  }

  function applyPatternTransform(s) {
    const cx = s.roomW / 2;
    const cy = s.roomH / 2;
    els.patternRoot.setAttribute(
      "transform",
      "translate(" +
        s.offsetX +
        " " +
        s.offsetY +
        ") rotate(" +
        s.rotation +
        " " +
        cx +
        " " +
        cy +
        ")"
    );
  }

  function applyViewBox() {
    els.svg.setAttribute(
      "viewBox",
      view.x + " " + view.y + " " + view.w + " " + view.h
    );
  }

  function fitViewToRoom(margin) {
    const s = getSettings();
    const m = margin !== undefined ? margin : Math.max(s.roomW, s.roomH) * 0.05;
    view.x = -m;
    view.y = -m;
    view.w = s.roomW + 2 * m;
    view.h = s.roomH + 2 * m;
    applyViewBox();
  }

  function zoomAt(factor, focalX, focalY) {
    const newW = view.w / factor;
    const newH = view.h / factor;
    const relX = (focalX - view.x) / view.w;
    const relY = (focalY - view.y) / view.h;
    view.x = focalX - relX * newW;
    view.y = focalY - relY * newH;
    view.w = newW;
    view.h = newH;
    applyViewBox();
  }

  function clientToSvg(clientX, clientY) {
    const pt = els.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = els.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function updateGridInfo() {
    const s = getSettings();
    const used = TG.patternSize(grid, s.tile, s.grout, s.cornerCut);
    els.gridInfo.textContent =
      TG.tileCountLabel(grid) +
      " (" +
      used.w.toFixed(1) +
      " × " +
      used.h.toFixed(1) +
      " cm pattern)";
    els.exportHint.textContent =
      "Import in Sweet Home 3D: " +
      s.roomW.toFixed(0) +
      " × " +
      s.roomH.toFixed(0) +
      " cm" +
      (s.rotation !== 0 || s.offsetX !== 0 || s.offsetY !== 0
        ? " (pattern rotated/offset in export)."
        : ".");
  }

  function setProjectStatus(msg) {
    els.projectStatus.textContent = msg || "";
  }

  function setPanelCollapsed(collapsed) {
    els.panel.classList.toggle("is-collapsed", collapsed);
    els.btnPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    els.btnPanelToggle.textContent = collapsed ? "▶" : "◀";
    els.btnPanelToggle.title = collapsed ? "Show settings panel" : "Hide settings panel";
    try {
      localStorage.setItem("mosaic-panel-collapsed", collapsed ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function initPanelToggle() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem("mosaic-panel-collapsed") === "1";
    } catch (e) {
      /* ignore */
    }
    setPanelCollapsed(collapsed);
    els.btnPanelToggle.addEventListener("click", function () {
      setPanelCollapsed(!els.panel.classList.contains("is-collapsed"));
    });
  }

  function applySettingsToForm(s) {
    els.roomWidth.value = String(s.roomW);
    els.roomHeight.value = String(s.roomH);
    els.offsetX.value = String(s.offsetX);
    els.offsetY.value = String(s.offsetY);
    els.rotation.value = String(s.rotation);
    els.tileSize.value = String(s.tile);
    els.groutWidth.value = String(s.grout);
    els.groutColor.value = s.groutColor;
    els.cornerCut.value = String(s.cornerCut);
    els.paintColor.value = s.paintColor;
    els.gridModeRadios.forEach(function (radio) {
      radio.checked = radio.value === s.mode;
    });
    updateModeUi();
  }

  function applyLoadedProject(doc) {
    applySettingsToForm(doc.settings);
    els.exportPpi.value = String(doc.ppi);
    const s = getSettings();
    const oldDims = { cols: doc.gridData.cols, rows: doc.gridData.rows };
    catalog.byId.clear();
    catalog.order.length = 0;
    Catalog.list(doc.catalog).forEach(function (e) {
      Catalog.add(catalog, {
        id: e.id,
        name: e.name,
        mime: e.mime,
        dataUrl: e.dataUrl,
        w: e.w,
        h: e.h,
      });
    });
    if (doc.settings.brushTileId) {
      setTileBrush(
        doc.settings.brushTileId,
        doc.settings.brushFlipH,
        doc.settings.brushFlipV,
        doc.settings.brushRot
      );
    } else {
      setColorBrush();
    }
    grid = TG.createGrid(
      s.mode,
      s.roomW,
      s.roomH,
      s.tile,
      s.grout,
      s.cornerCut,
      s.groutColor
    );
    TG.mergeCells(
      grid,
      { cells: doc.gridData.cells, fillers: doc.gridData.fillers },
      s.groutColor,
      true
    );
    undoStacks.clear();
    Catalog.ensureAllDims(catalog).then(function () {
      updateGridInfo();
      render();
      fitViewToRoom();
      updateSwatchActive();
      renderGallery();
    });

    if (oldDims.cols !== grid.cols || oldDims.rows !== grid.rows) {
      setProjectStatus(
        "Loaded; grid is now " +
          grid.cols +
          "×" +
          grid.rows +
          " (file had " +
          oldDims.cols +
          "×" +
          oldDims.rows +
          "). Colors merged where they overlap."
      );
    } else {
      setProjectStatus("Loaded " + doc.gridData.cols + "×" + doc.gridData.rows + " project.");
    }
  }

  function saveProject() {
    const s = getSettings();
    const ppi = Math.min(40, Math.max(1, readNum(els.exportPpi, 10)));
    const name = MP.suggestedFilename(s);
    MP.downloadText(name, MP.encodeText(s, grid, ppi, catalog, true));
    setProjectStatus("Saved " + name);
  }

  function loadProjectFromText(text) {
    const doc = MP.decodeText(text);
    applyLoadedProject(doc);
  }

  function rebuildGrid(preserveColors) {
    const s = getSettings();
    const old = grid;
    grid = TG.createGrid(
      s.mode,
      s.roomW,
      s.roomH,
      s.tile,
      s.grout,
      s.cornerCut,
      s.groutColor
    );
    TG.mergeCells(grid, old, s.groutColor, preserveColors);
    undoStacks.clear();
    updateGridInfo();
    render();
    if (!preserveColors) fitViewToRoom();
  }

  function cellKey(kind, col, row) {
    return kind + ":" + col + "," + row;
  }

  function pushUndo(kind, col, row, previousCell) {
    const key = cellKey(kind, col, row);
    let stack = undoStacks.get(key);
    if (!stack) {
      stack = [];
      undoStacks.set(key, stack);
    }
    stack.push(Cell.clone(previousCell));
  }

  function clearHoveredTile() {
    if (hoveredTile) {
      hoveredTile.classList.remove("is-hovered");
      hoveredTile = null;
    }
  }

  function setHoveredTile(target) {
    if (hoveredTile === target) return;
    clearHoveredTile();
    if (target && target.classList.contains("tile")) {
      hoveredTile = target;
      hoveredTile.classList.add("is-hovered");
    }
  }

  function render() {
    const s = getSettings();
    clearHoveredTile();

    els.clipRect.setAttribute("width", s.roomW);
    els.clipRect.setAttribute("height", s.roomH);
    els.roomBg.setAttribute("width", s.roomW);
    els.roomBg.setAttribute("height", s.roomH);
    els.roomBg.setAttribute("fill", s.groutColor);

    applyPatternTransform(s);
    TG.renderTiles(
      grid,
      els.tilesLayer,
      s.tile,
      s.grout,
      s.cornerCut,
      catalog,
      s.groutColor
    );
    applyViewBox();
  }

  function tileLabel(kind, col, row) {
    let label = "Tile";
    if (kind === "hex") label = "Hex";
    else if (kind === "oct") label = "Octagon";
    else if (kind === "filler") label = "Filler";
    return label + " " + (col + 1) + ", " + (row + 1);
  }

  function showTileHover(target) {
    if (!target || !target.classList.contains("tile")) {
      clearHoveredTile();
      els.cursorPos.textContent = "";
      return;
    }
    setHoveredTile(target);
    els.cursorPos.textContent = tileLabel(
      target.dataset.kind,
      parseInt(target.dataset.col, 10),
      parseInt(target.dataset.row, 10)
    );
  }

  function paintFromTarget(target) {
    if (!target || !target.classList.contains("tile")) return;
    const kind = target.dataset.kind;
    const col = parseInt(target.dataset.col, 10);
    const row = parseInt(target.dataset.row, 10);
    const next = brushCell();
    const prev = TG.getCell(grid, kind, col, row);
    if (Cell.equal(prev, next)) return;
    pushUndo(kind, col, row, prev);
    if (!TG.setCell(grid, kind, col, row, next)) return;
    render();
    els.cursorPos.textContent = tileLabel(kind, col, row);
  }

  function revertFromTarget(target) {
    if (!target || !target.classList.contains("tile")) return;
    const kind = target.dataset.kind;
    const col = parseInt(target.dataset.col, 10);
    const row = parseInt(target.dataset.row, 10);
    const key = cellKey(kind, col, row);
    const stack = undoStacks.get(key);
    if (!stack || stack.length === 0) return;
    const cell = stack.pop();
    if (stack.length === 0) undoStacks.delete(key);
    TG.setCell(grid, kind, col, row, cell);
    render();
    els.cursorPos.textContent = tileLabel(kind, col, row);
  }

  function fillAllGrout() {
    TG.mergeCells(grid, null, els.groutColor.value, false);
    undoStacks.clear();
    render();
  }

  function buildSwatches() {
    els.swatches.replaceChildren();
    PRESET_COLORS.forEach(function (hex) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch";
      btn.style.backgroundColor = hex;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", hex);
      btn.title = hex;
      btn.addEventListener("click", function () {
        els.paintColor.value = hex;
        setColorBrush();
      });
      els.swatches.appendChild(btn);
    });
    updateSwatchActive();
  }

  function updateSwatchActive() {
    const colorActive = brush.mode === "color";
    const current = els.paintColor.value.toLowerCase();
    els.swatches.querySelectorAll(".swatch").forEach(function (btn) {
      const match =
        colorActive &&
        btn.style.backgroundColor &&
        rgbToHex(btn.style.backgroundColor).toLowerCase() === current;
      btn.classList.toggle("is-active", match);
    });
  }

  function renderGallery() {
    els.gallery.replaceChildren();
    Catalog.list(catalog).forEach(function (entry) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gallery-thumb";
      btn.setAttribute("role", "option");
      btn.title = entry.name;
      const img = document.createElement("img");
      img.src = entry.dataUrl;
      img.alt = entry.name;
      img.draggable = false;
      btn.appendChild(img);
      const active =
        brush.mode === "tile" && brush.id === entry.id;
      btn.classList.toggle("is-active", active);
      btn.addEventListener("click", function () {
        setTileBrush(entry.id, brush.id === entry.id ? brush.h : false, brush.id === entry.id ? brush.v : false, brush.id === entry.id ? brush.r : 0);
      });
      els.gallery.appendChild(btn);
    });
  }

  function initCatalogUi() {
    els.btnImportTile.addEventListener("click", function () {
      els.importTileFile.click();
    });
    els.importTileFile.addEventListener("change", function (e) {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      Catalog.importFile(catalog, file)
        .then(function (id) {
          setTileBrush(id, false, false, 0);
          setProjectStatus("Added “" + Catalog.get(catalog, id).name + "” to catalog.");
        })
        .catch(function (err) {
          alert(err.message || String(err));
        });
    });
    els.btnFlipH.addEventListener("click", function () {
      if (brush.mode !== "tile") return;
      setTileBrush(brush.id, !brush.h, brush.v, brush.r);
    });
    els.btnFlipV.addEventListener("click", function () {
      if (brush.mode !== "tile") return;
      setTileBrush(brush.id, brush.h, !brush.v, brush.r);
    });
    els.btnRot.addEventListener("click", function () {
      if (brush.mode !== "tile") return;
      setTileBrush(brush.id, brush.h, brush.v, (brush.r + 90) % 360);
    });
    els.paintColor.addEventListener("input", setColorBrush);
    renderGallery();
  }

  function rgbToHex(rgb) {
    const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!m) return rgb;
    return (
      "#" +
      [m[1], m[2], m[3]]
        .map(function (x) {
          return parseInt(x, 10).toString(16).padStart(2, "0");
        })
        .join("")
    );
  }

  function exportPng() {
    const s = getSettings();
    const ppi = Math.min(40, Math.max(1, readNum(els.exportPpi, 10)));
    const pxW = Math.round(s.roomW * ppi);
    const pxH = Math.round(s.roomH * ppi);

    const clone = els.svg.cloneNode(true);
    clone.setAttribute("viewBox", "0 0 " + s.roomW + " " + s.roomH);
    clone.setAttribute("width", pxW);
    clone.setAttribute("height", pxH);
    clone.removeAttribute("preserveAspectRatio");

    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = s.groutColor;
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (pngBlob) {
        if (!pngBlob) return;
        const now = new Date();
        const safeNowStr = (
            now.toISOString().split(".")[0]
            .replaceAll(":", "-")
        )
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download =
          "mosaic-" +
          Math.round(s.roomW) +
          "x" +
          Math.round(s.roomH) +
          "cm." +
          safeNowStr +
          ".png";
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert("Export failed. Try a lower resolution.");
    };
    img.src = url;
  }

  function findTileAt(clientX, clientY) {
    const prev = els.tilesLayer.style.pointerEvents;
    els.tilesLayer.style.pointerEvents = "none";
    const el = document.elementFromPoint(clientX, clientY);
    els.tilesLayer.style.pointerEvents = prev || "";
    return el && el.closest ? el.closest(".tile") : null;
  }

  els.tilesLayer.addEventListener("pointerdown", function (e) {
    if (e.button === 2) {
      const t = e.target.closest(".tile");
      if (t) revertFromTarget(t);
      e.preventDefault();
      return;
    }
    if (e.button === 1 || e.shiftKey) return;
    const t = e.target.closest(".tile");
    if (!t) return;
    painting = true;
    t.setPointerCapture(e.pointerId);
    paintFromTarget(t);
    e.preventDefault();
  });

  els.tilesLayer.addEventListener("contextmenu", function (e) {
    const t = e.target.closest(".tile");
    if (t) {
      e.preventDefault();
      revertFromTarget(t);
    }
  });

  els.tilesLayer.addEventListener("pointermove", function (e) {
    if (painting) {
      const tile = findTileAt(e.clientX, e.clientY);
      if (tile) {
        paintFromTarget(tile);
        setHoveredTile(tile);
      }
      return;
    }
    const tile = findTileAt(e.clientX, e.clientY);
    showTileHover(tile);
  });

  els.tilesLayer.addEventListener("pointerleave", function () {
    if (!painting) {
      clearHoveredTile();
      els.cursorPos.textContent = "";
    }
  });

  window.addEventListener("pointerup", function () {
    painting = false;
    panning = false;
  });

  els.tilesLayer.addEventListener("keydown", function (e) {
    const t = e.target.closest(".tile");
    if (!t || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    paintFromTarget(t);
  });

  els.canvasWrap.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      const pt = clientToSvg(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, pt.x, pt.y);
    },
    { passive: false }
  );

  els.canvasWrap.addEventListener("pointerdown", function (e) {
    if (e.button !== 1 && !e.shiftKey) return;
    if (e.target.closest(".tile") && !e.shiftKey) return;
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    els.canvasWrap.classList.add("is-panning");
    e.preventDefault();
  });

  els.canvasWrap.addEventListener("pointermove", function (e) {
    if (!panning) return;
    const rect = els.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scaleX = view.w / rect.width;
    const scaleY = view.h / rect.height;
    view.x = panStart.vx - (e.clientX - panStart.x) * scaleX;
    view.y = panStart.vy - (e.clientY - panStart.y) * scaleY;
    applyViewBox();
  });

  els.canvasWrap.addEventListener("pointerup", function () {
    panning = false;
    els.canvasWrap.classList.remove("is-panning");
  });

  els.btnZoomIn.addEventListener("click", function () {
    const s = getSettings();
    zoomAt(1.25, s.roomW / 2, s.roomH / 2);
  });

  els.btnZoomOut.addEventListener("click", function () {
    const s = getSettings();
    zoomAt(1 / 1.25, s.roomW / 2, s.roomH / 2);
  });

  els.btnZoomReset.addEventListener("click", function () {
    fitViewToRoom();
  });

  els.btnRebuild.addEventListener("click", function () {
    rebuildGrid(true);
  });

  els.btnFillGrout.addEventListener("click", fillAllGrout);
  els.btnExport.addEventListener("click", exportPng);
  els.btnSave.addEventListener("click", saveProject);
  els.btnLoad.addEventListener("click", function () {
    els.loadFile.click();
  });
  els.loadFile.addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    file
      .text()
      .then(loadProjectFromText)
      .catch(function (err) {
        setProjectStatus("");
        alert(err.message || String(err));
      });
  });
  els.groutColor.addEventListener("input", function () {
    els.roomBg.setAttribute("fill", els.groutColor.value);
  });

  ["offset-x", "offset-y", "rotation"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", render);
  });

  ["room-width", "room-height", "tile-size", "grout-width", "corner-cut"].forEach(
    function (id) {
      document.getElementById(id).addEventListener("change", function () {
        rebuildGrid(true);
      });
    }
  );

  els.gridModeRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      updateModeUi();
      rebuildGrid(false);
    });
  });

  buildSwatches();
  initCatalogUi();
  initPanelToggle();
  updateModeUi();
  rebuildGrid(false);
})();
