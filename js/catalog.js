/**
 * Tile image catalog (in-memory; serialized into project JSON as base64).
 */
(function (global) {
  "use strict";

  function create() {
    return { byId: new Map(), order: [] };
  }

  function newId() {
    return "t-" + Math.random().toString(36).slice(2, 10);
  }

  function add(catalog, entry) {
    const id = entry.id || newId();
    const rec = {
      id: id,
      name: entry.name || "Tile",
      mime: entry.mime || "image/png",
      dataUrl: entry.dataUrl,
      w: entry.w || 100,
      h: entry.h || 100,
    };
    if (!catalog.byId.has(id)) catalog.order.push(id);
    catalog.byId.set(id, rec);
    return id;
  }

  function get(catalog, id) {
    return catalog.byId.get(id) || null;
  }

  function getDataUrl(catalog, id) {
    const e = get(catalog, id);
    return e ? e.dataUrl : null;
  }

  function remove(catalog, id) {
    if (!catalog.byId.has(id)) return;
    catalog.byId.delete(id);
    catalog.order = catalog.order.filter(function (x) {
      return x !== id;
    });
  }

  function list(catalog) {
    return catalog.order
      .map(function (id) {
        return catalog.byId.get(id);
      })
      .filter(Boolean);
  }

  function probeDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
      };
      img.onerror = function () {
        resolve({ w: 100, h: 100 });
      };
      img.src = dataUrl;
    });
  }

  function readFileAsEntry(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = reader.result;
        const mime =
          file.type ||
          (typeof dataUrl === "string" && dataUrl.split(";")[0].slice(5)) ||
          "image/png";
        const name = file.name.replace(/\.[^.]+$/, "") || "Tile";
        probeDataUrl(dataUrl).then(function (dim) {
          resolve({
            name: name,
            mime: mime,
            dataUrl: dataUrl,
            w: dim.w,
            h: dim.h,
          });
        });
      };
      reader.onerror = function () {
        reject(new Error("Could not read image file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function importFile(catalog, file) {
    return readFileAsEntry(file).then(function (entry) {
      return add(catalog, entry);
    });
  }

  /** Project format: [[id, name, mime, base64], ...] */
  function toProjectArray(catalog) {
    return catalog.order.map(function (id) {
      const e = catalog.byId.get(id);
      const parts = e.dataUrl.split(",");
      const base64 = parts.length > 1 ? parts[1] : parts[0];
      return [e.id, e.name, e.mime, base64];
    });
  }

  function fromProjectArray(arr) {
    const catalog = create();
    if (!Array.isArray(arr)) return catalog;
    arr.forEach(function (row) {
      if (!Array.isArray(row) || row.length < 4) return;
      const mime = row[2] || "image/png";
      const dataUrl = "data:" + mime + ";base64," + row[3];
      add(catalog, { id: String(row[0]), name: row[1] || "Tile", mime: mime, dataUrl: dataUrl });
    });
    return catalog;
  }

  function clone(catalog) {
    const c = create();
    catalog.order.forEach(function (id) {
      const e = catalog.byId.get(id);
      add(c, { id: e.id, name: e.name, mime: e.mime, dataUrl: e.dataUrl });
    });
    return c;
  }

  function ensureDims(entry) {
    if (!entry || !entry.dataUrl) return Promise.resolve();
    return probeDataUrl(entry.dataUrl).then(function (dim) {
      entry.w = dim.w;
      entry.h = dim.h;
    });
  }

  function ensureAllDims(catalog) {
    return Promise.all(
      list(catalog).map(function (e) {
        return ensureDims(e);
      })
    );
  }

  global.MosaicCatalog = {
    create,
    add,
    get,
    getDataUrl,
    remove,
    list,
    importFile,
    toProjectArray,
    fromProjectArray,
    clone,
    ensureAllDims,
  };
})(typeof window !== "undefined" ? window : globalThis);
