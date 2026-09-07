import { describe, expect, it } from "vitest";
import { applyReasonToFirstLine } from "./voucher-dialog.utils";
import type { VoucherFormLine } from "./voucher-dialog.constants";

const line = (description: string, amount = 0): VoucherFormLine => ({
  description,
  amount,
  category: "",
  categoryId: undefined,
});

describe("applyReasonToFirstLine", () => {
  it("fills the first line when its description is empty", () => {
    const out = applyReasonToFirstLine([line("")], "Chi tiền điện tháng 8");
    expect(out[0].description).toBe("Chi tiền điện tháng 8");
  });

  it("leaves a description the user already typed alone", () => {
    const lines = [line("Tiền điện chi nhánh HCM")];
    const out = applyReasonToFirstLine(lines, "Chi tiền điện tháng 8");
    expect(out).toBe(lines);
    expect(out[0].description).toBe("Tiền điện chi nhánh HCM");
  });

  it("treats a whitespace-only description as empty", () => {
    const out = applyReasonToFirstLine([line("   ")], "Chi tiền nước");
    expect(out[0].description).toBe("Chi tiền nước");
  });

  it("does nothing when the reason is blank", () => {
    const lines = [line("")];
    expect(applyReasonToFirstLine(lines, "   ")).toBe(lines);
  });

  it("does not throw on an empty line array", () => {
    expect(applyReasonToFirstLine([], "Chi khác")).toEqual([]);
  });

  it("only touches the first line", () => {
    const out = applyReasonToFirstLine([line(""), line("")], "Chi khác");
    expect(out[0].description).toBe("Chi khác");
    expect(out[1].description).toBe("");
  });

  it("trims the reason before copying", () => {
    const out = applyReasonToFirstLine([line("")], "  Thu nợ khách  ");
    expect(out[0].description).toBe("Thu nợ khách");
  });

  it("returns a new array and never mutates the input", () => {
    // The dialogs hand the result straight to setLines; mutating in place would
    // keep the same reference and skip the re-render.
    const lines = [line("")];
    const out = applyReasonToFirstLine(lines, "Chi khác");
    expect(out).not.toBe(lines);
    expect(lines[0].description).toBe("");
  });

  it("preserves the amount and category already on the line", () => {
    const out = applyReasonToFirstLine(
      [{ description: "", amount: 500_000, category: "Thu khác", categoryId: "c1" }],
      "Thu tiền mặt bán lẻ",
    );
    expect(out[0]).toEqual({
      description: "Thu tiền mặt bán lẻ",
      amount: 500_000,
      category: "Thu khác",
      categoryId: "c1",
    });
  });
});
