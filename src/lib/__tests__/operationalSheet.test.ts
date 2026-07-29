import { describe, expect, it } from "vitest";
import { getMobileSheetView, isOperationalTab } from "@/lib/operationalSheet";

describe("operational sheet presentation state", () => {
  it("only exposes a collapsed mobile sheet as a peek when map context exists", () => {
    expect(getMobileSheetView("collapsed", false)).toBe("collapsed");
    expect(getMobileSheetView("collapsed", true)).toBe("peek");
    expect(getMobileSheetView("full", true)).toBe("full");
  });

  it("accepts only supported sheet tabs", () => {
    expect(isOperationalTab("inspect")).toBe(true);
    expect(isOperationalTab("orders")).toBe(true);
    expect(isOperationalTab("situation")).toBe(true);
    expect(isOperationalTab("reports")).toBe(false);
  });
});
