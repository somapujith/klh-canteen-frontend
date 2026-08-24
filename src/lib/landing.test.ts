import { describe, it, expect } from "vitest";
import { landingPathFor } from "./landing";

describe("landingPathFor", () => {
  it("sends staff straight to the order board, not the dashboard", () => {
    expect(landingPathFor("ADMIN")).toBe("/admin/board");
    expect(landingPathFor("SUPERADMIN")).toBe("/admin/board");
  });

  it("sends a student to the menu", () => {
    expect(landingPathFor("STUDENT")).toBe("/student");
  });

  it("sends anyone without a role to login", () => {
    expect(landingPathFor(null)).toBe("/login");
    expect(landingPathFor("NONSENSE")).toBe("/login");
  });
});
