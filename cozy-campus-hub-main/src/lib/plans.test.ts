import { describe, expect, it } from "vitest";
import {
  calculatePaymentPlanUpdate,
  calculatePendingBalance,
  calculatePlanEndDate,
  getPlanById,
  getPlanPrice,
  normalizePlanLabel,
} from "./plans";

const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10);

describe("plans", () => {
  it("normalizes current plan labels, legacy aliases, and partial suffixes", () => {
    expect(getPlanById(7)?.label).toBe("Boys Monthly Mess (2 Times)");
    expect(normalizePlanLabel("Boys Monthly Mess")).toBe(
      "Boys Monthly Mess (1 Time)",
    );
    expect(normalizePlanLabel(" Girls Monthly Mess (Partial) ")).toBe(
      "Girls Monthly Mess (1 Time)",
    );
    expect(getPlanPrice("Boys Monthly Mess (2 Times) (Partial)")).toBe(2200);
  });

  it("calculates monthly, day, and one-time plan end dates", () => {
    const start = new Date(Date.UTC(2026, 0, 10));

    expect(dateOnly(calculatePlanEndDate(start, "Boys Monthly Mess"))).toBe(
      "2026-02-10",
    );
    expect(dateOnly(calculatePlanEndDate(start, "Girls 1 Day Mess"))).toBe(
      "2026-01-11",
    );
    expect(dateOnly(calculatePlanEndDate(start, "Boys 1 Time Mess"))).toBe(
      "2026-01-11",
    );
  });

  it("calculates pending balance for partial payments", () => {
    expect(
      calculatePendingBalance({
        planLabel: "Boys Monthly Mess (2 Times) (Partial)",
        amountPaid: 1200,
        existingPendingAmount: 100,
      }),
    ).toBe(1100);
  });

  it("builds an admin payment approval update", () => {
    const update = calculatePaymentPlanUpdate({
      payment: {
        plan_name: "Girls Monthly Mess (Partial)",
        amount: 400,
        membership_start_date: new Date(Date.UTC(2026, 1, 1)),
      },
      profile: { pending_amount: 0 },
      now: new Date(Date.UTC(2026, 0, 1)),
    });

    expect(update).toMatchObject({
      plan: "Girls Monthly Mess (1 Time)",
      status: "active",
      pending_amount: 600,
    });
    expect(update.plan_start_date.slice(0, 10)).toBe("2026-02-01");
    expect(update.plan_end_date.slice(0, 10)).toBe("2026-03-01");
  });
});
