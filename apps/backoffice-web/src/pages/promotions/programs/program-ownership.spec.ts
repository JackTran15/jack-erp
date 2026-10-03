import { describe, expect, it } from "vitest";
import {
  allManageable,
  branchLockFor,
  canManageProgram,
  CHAIN_OWNER_LABEL,
  ownerLabel,
} from "./program-ownership";

const HCM = "branch-hcm";
const HN = "branch-hn";
const chain = { ownerBranchId: null, ownerBranchName: null };
const hcmOwned = { ownerBranchId: HCM, ownerBranchName: "Hồ Chí Minh" };
const hnOwned = { ownerBranchId: HN, ownerBranchName: "Hà Nội" };

describe("canManageProgram (access table, FE rows)", () => {
  it.each([
    ["own branch program", hcmOwned, true],
    ["another branch's program", hnOwned, false],
    ["chain program", chain, false],
  ])("branch manager on HCM — %s → %s", (_label, program, expected) => {
    expect(canManageProgram(program, HCM, false)).toBe(expected);
  });

  it("chain manager manages everything", () => {
    for (const program of [chain, hcmOwned, hnOwned]) {
      expect(canManageProgram(program, HN, true)).toBe(true);
    }
  });

  it("branch manager without an active branch manages nothing", () => {
    expect(canManageProgram(hcmOwned, null, false)).toBe(false);
  });
});

describe("branchLockFor (AC-04)", () => {
  it("locks a branch program being edited to its owner, for anyone", () => {
    const lock = { branchId: HCM, branchName: "Hồ Chí Minh" };
    expect(branchLockFor({ editing: hcmOwned, activeBranchId: HCM, isChainManager: false })).toEqual(lock);
    expect(branchLockFor({ editing: hcmOwned, activeBranchId: HN, isChainManager: true })).toEqual(lock);
  });

  it("never locks a chain program being edited", () => {
    expect(branchLockFor({ editing: chain, activeBranchId: HCM, isChainManager: true })).toBeUndefined();
  });

  it("locks a branch manager's new program to the active branch, not a chain manager's", () => {
    expect(branchLockFor({ editing: undefined, activeBranchId: HCM, isChainManager: false })).toEqual({
      branchId: HCM,
      branchName: null,
    });
    expect(branchLockFor({ editing: undefined, activeBranchId: HCM, isChainManager: true })).toBeUndefined();
  });
});

describe("ownerLabel", () => {
  it("reads Toàn chuỗi for chain programs and the branch name otherwise", () => {
    expect(ownerLabel(chain)).toBe(CHAIN_OWNER_LABEL);
    expect(ownerLabel(hcmOwned)).toBe("Hồ Chí Minh");
  });
});

describe("allManageable (AC-09 list actions)", () => {
  it("is true only when every selected row is manageable", () => {
    expect(allManageable([hcmOwned], HCM, false)).toBe(true);
    expect(allManageable([hcmOwned, chain], HCM, false)).toBe(false);
    expect(allManageable([chain], HCM, false)).toBe(false);
    expect(allManageable([hcmOwned, chain, hnOwned], HCM, true)).toBe(true);
  });
});
