/**
 * Mosaic cell: solid color or catalog image reference.
 */
(function (global) {
  "use strict";

  function color(hex) {
    return { t: "c", v: hex };
  }

  function image(id, flipH, flipV, rot) {
    return {
      t: "i",
      id: id,
      h: flipH ? 1 : 0,
      v: flipV ? 1 : 0,
      r: ((rot % 360) + 360) % 360,
    };
  }

  function isColor(cell) {
    return !cell || cell.t === "c";
  }

  function isImage(cell) {
    return cell && cell.t === "i";
  }

  function grout(groutHex) {
    return color(groutHex);
  }

  function clone(cell) {
    if (!cell) return null;
    if (typeof cell === "string") return color(normalizeHex(cell, "#888888"));
    if (cell.t === "c") return color(cell.v);
    return image(cell.id, cell.h, cell.v, cell.r);
  }

  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.t !== b.t) return false;
    if (a.t === "c") return a.v === b.v;
    return a.id === b.id && a.h === b.h && a.v === b.v && a.r === b.r;
  }

  /** Fallback SVG fill (under image or solid tile). */
  function fillHex(cell, groutHex) {
    if (isColor(cell)) return cell.v;
    return groutHex;
  }

  /** Compact JSON: "#hex" or [id, h, v, r]. */
  function encode(cell) {
    if (!cell || cell.t === "c") {
      return cell && cell.v ? cell.v : "#888888";
    }
    return [cell.id, cell.h, cell.v, cell.r];
  }

  function decode(raw, groutHex) {
    if (typeof raw === "string") {
      return color(normalizeHex(raw, groutHex));
    }
    if (Array.isArray(raw) && raw.length >= 1) {
      return image(
        String(raw[0]),
        !!raw[1],
        !!raw[2],
        parseInt(raw[3], 10) || 0
      );
    }
    if (raw && raw.t === "c") return color(normalizeHex(raw.v, groutHex));
    if (raw && raw.t === "i") {
      return image(raw.id, !!raw.h, !!raw.v, raw.r || 0);
    }
    return color(groutHex);
  }

  function normalizeHex(value, fallback) {
    if (typeof value !== "string") return fallback;
    const s = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return (
        "#" +
        s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
      ).toLowerCase();
    }
    return fallback;
  }

  global.MosaicCell = {
    color,
    image,
    isColor,
    isImage,
    grout,
    clone,
    equal,
    fillHex,
    encode,
    decode,
    normalizeHex,
  };
})(typeof window !== "undefined" ? window : globalThis);
