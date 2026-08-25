import { describe, it, expect, beforeEach } from "vitest";
import { loadMenuPrefs, reorderCategories, saveMenuPrefs } from "./menuAdmin";
import type { Category } from "../types/admin";

function cat(id: string, sortOrder: number): Category {
  return { id, name: id.toUpperCase(), sortOrder, items: [] };
}

describe("reorderCategories", () => {
  it("moves a category down and renumbers densely from zero", () => {
    const list = [cat("a", 0), cat("b", 1), cat("c", 2)];

    const { categories, patches } = reorderCategories(list, 0, 2);

    expect(categories.map((c) => c.id)).toEqual(["b", "c", "a"]);
    expect(categories.map((c) => c.sortOrder)).toEqual([0, 1, 2]);
    expect(patches).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "a", sortOrder: 2 },
    ]);
  });

  it("moves a category up", () => {
    const list = [cat("a", 0), cat("b", 1), cat("c", 2)];

    const { categories } = reorderCategories(list, 2, 0);

    expect(categories.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  /**
   * The API defaults sortOrder to 0, so a seeded menu can have every category
   * sharing it. Swapping two values inside that set would leave the order
   * undefined on the next load; renumbering all of them is what fixes it.
   */
  it("repairs a set of categories that all share sortOrder 0", () => {
    const list = [cat("a", 0), cat("b", 0), cat("c", 0)];

    const { categories, patches } = reorderCategories(list, 2, 0);

    expect(categories.map((c) => c.sortOrder)).toEqual([0, 1, 2]);
    // "c" lands at 0 and already held 0, so it needs no write; the other two do.
    expect(patches).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("emits no patches and no new array when the position does not change", () => {
    const list = [cat("a", 0), cat("b", 1)];

    const result = reorderCategories(list, 1, 1);

    expect(result.patches).toEqual([]);
    expect(result.categories).toBe(list);
  });

  it.each([
    ["negative source", -1, 0],
    ["negative target", 0, -1],
    ["source past the end", 5, 0],
    ["target past the end", 0, 5],
  ])("ignores an out-of-range move (%s)", (_label, from, to) => {
    const list = [cat("a", 0), cat("b", 1)];

    const result = reorderCategories(list, from, to);

    expect(result.categories).toBe(list);
    expect(result.patches).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const list = [cat("a", 0), cat("b", 1), cat("c", 2)];
    const snapshot = list.map((c) => ({ ...c }));

    reorderCategories(list, 0, 2);

    expect(list).toEqual(snapshot);
  });
});

describe("menu preferences", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips density and collapsed sections for one admin", () => {
    saveMenuPrefs("u1", { density: "compact", collapsed: ["c1", "c2"] });

    expect(loadMenuPrefs("u1")).toEqual({ density: "compact", collapsed: ["c1", "c2"] });
  });

  it("keeps two admins on the same machine separate", () => {
    saveMenuPrefs("u1", { density: "compact", collapsed: ["c1"] });
    saveMenuPrefs("u2", { density: "comfortable", collapsed: [] });

    expect(loadMenuPrefs("u1").density).toBe("compact");
    expect(loadMenuPrefs("u2").density).toBe("comfortable");
  });

  it("falls back to defaults for an admin with nothing stored", () => {
    expect(loadMenuPrefs("nobody")).toEqual({ density: "comfortable", collapsed: [] });
  });

  it.each([
    ["not json", "{not json"],
    ["a bare null", "null"],
    ["a non-object", '"a string"'],
    ["an unknown density", '{"density":"enormous","collapsed":[]}'],
    ["a non-array collapsed list", '{"density":"compact","collapsed":"c1"}'],
  ])("survives %s in storage", (_label, stored) => {
    localStorage.setItem("klh_menu_prefs:u1", stored);

    const prefs = loadMenuPrefs("u1");

    expect(["comfortable", "compact"]).toContain(prefs.density);
    expect(Array.isArray(prefs.collapsed)).toBe(true);
  });

  it("drops non-string entries from a partially corrupt collapsed list", () => {
    localStorage.setItem("klh_menu_prefs:u1", '{"density":"compact","collapsed":["c1",7,null,"c2"]}');

    expect(loadMenuPrefs("u1").collapsed).toEqual(["c1", "c2"]);
  });
});
