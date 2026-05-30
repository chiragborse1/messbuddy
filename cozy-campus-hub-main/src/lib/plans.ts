export type PlanAudience = "boys" | "girls";
export type PlanDurationType = "monthly" | "day" | "time";
export type PlanDateInput = Date | string | number | null | undefined;

export interface MessPlan {
  id: number;
  label: string;
  price: number;
  description: string;
  audience: PlanAudience;
  durationType: PlanDurationType;
}

export interface MembershipPlanRecord {
  id: number | string;
  label: string;
  price: number | string;
  description?: string | null;
  audience: PlanAudience;
  duration_type?: PlanDurationType | null;
  durationType?: PlanDurationType | null;
  is_active?: boolean | null;
  sort_order?: number | null;
}

export const MESS_PLANS: readonly MessPlan[] = [
  {
    id: 1,
    label: "Boys Monthly Mess (1 Time)",
    price: 1300,
    description: "1 meal/day access for boys",
    audience: "boys",
    durationType: "monthly",
  },
  {
    id: 2,
    label: "Girls Monthly Mess (1 Time)",
    price: 1000,
    description: "1 meal/day access for girls",
    audience: "girls",
    durationType: "monthly",
  },
  {
    id: 7,
    label: "Boys Monthly Mess (2 Times)",
    price: 2200,
    description: "2 meals/day access for boys",
    audience: "boys",
    durationType: "monthly",
  },
  {
    id: 8,
    label: "Girls Monthly Mess (2 Times)",
    price: 1600,
    description: "2 meals/day access for girls",
    audience: "girls",
    durationType: "monthly",
  },
  {
    id: 3,
    label: "Boys 1 Day Mess",
    price: 120,
    description: "24-hour access for boys",
    audience: "boys",
    durationType: "day",
  },
  {
    id: 4,
    label: "Girls 1 Day Mess",
    price: 80,
    description: "24-hour access for girls",
    audience: "girls",
    durationType: "day",
  },
  {
    id: 5,
    label: "Boys 1 Time Mess",
    price: 80,
    description: "Single meal choice for boys",
    audience: "boys",
    durationType: "time",
  },
  {
    id: 6,
    label: "Girls 1 Time Mess",
    price: 40,
    description: "Single meal choice for girls",
    audience: "girls",
    durationType: "time",
  },
];

const PLAN_ALIASES: Record<string, string> = {
  "boys monthly mess": "Boys Monthly Mess (1 Time)",
  "girls monthly mess": "Girls Monthly Mess (1 Time)",
};

const normalizeLookupKey = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export const mapMembershipPlanRecord = (plan: MembershipPlanRecord): MessPlan => ({
  id: Number(plan.id),
  label: plan.label,
  price: Number(plan.price) || 0,
  description: plan.description || "",
  audience: plan.audience,
  durationType: plan.durationType || plan.duration_type || "monthly",
});

const normalizePlanDefinition = (plan: MembershipPlanRecord | MembershipPlanRecord[] | null | undefined) => {
  if (Array.isArray(plan)) return plan[0] ? mapMembershipPlanRecord(plan[0]) : undefined;
  return plan ? mapMembershipPlanRecord(plan) : undefined;
};

const inferPlanDurationType = (planLabel: string | null | undefined): PlanDurationType | undefined => {
  const key = normalizeLookupKey(stripPartialPlanSuffix(planLabel ?? ""));
  if (!key) return undefined;
  if (key.includes("monthly") || key.includes("month")) return "monthly";
  if (key.includes("day")) return "day";
  if (key.includes("time") || key.includes("meal")) return "time";
  return undefined;
};

const getPlanDurationType = (
  planLabel: string | null | undefined,
  planDefinition?: MembershipPlanRecord | MembershipPlanRecord[] | null,
) => {
  const dynamicPlan = normalizePlanDefinition(planDefinition);
  return dynamicPlan?.durationType ?? getPlanByLabel(planLabel)?.durationType ?? inferPlanDurationType(planLabel);
};

export const stripPartialPlanSuffix = (planLabel: string) =>
  planLabel.replace(/\s*\(partial\)\s*$/i, "").trim();

export const isPartialPlanLabel = (planLabel: string | null | undefined) =>
  /\s*\(partial\)\s*$/i.test(planLabel ?? "");

export const normalizePlanLabel = (
  planLabel: string | null | undefined,
): string | undefined => {
  if (!planLabel) return undefined;

  const withoutPaymentSuffix = stripPartialPlanSuffix(planLabel);
  const key = normalizeLookupKey(withoutPaymentSuffix);
  const aliasedLabel = PLAN_ALIASES[key];

  return (
    aliasedLabel ??
    MESS_PLANS.find((plan) => normalizeLookupKey(plan.label) === key)?.label
  );
};

export const getPlanById = (id: number | string | null | undefined) => {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return undefined;

  return MESS_PLANS.find((plan) => plan.id === numericId);
};

export const getPlanByLabel = (planLabel: string | null | undefined) => {
  const normalizedLabel = normalizePlanLabel(planLabel);
  if (!normalizedLabel) return undefined;

  return MESS_PLANS.find((plan) => plan.label === normalizedLabel);
};

export const getPlanPrice = (
  plan: string | number | MessPlan | null | undefined,
  planDefinition?: MembershipPlanRecord | MembershipPlanRecord[] | null,
) => {
  const dynamicPlan = normalizePlanDefinition(planDefinition);
  if (dynamicPlan) return dynamicPlan.price;
  if (typeof plan === "number") return getPlanById(plan)?.price;
  if (typeof plan === "string") return getPlanByLabel(plan)?.price;
  return plan?.price;
};

const toValidDate = (value: PlanDateInput): Date | null => {
  if (value === null || value === undefined || value === "") return null;

  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const daysInStartMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

export const calculatePlanEndDate = (
  start: PlanDateInput,
  planLabel: string | null | undefined,
  planDefinition?: MembershipPlanRecord | MembershipPlanRecord[] | null,
) => {
  const startDate = toValidDate(start);
  const durationType = getPlanDurationType(planLabel, planDefinition);

  if (!startDate || !durationType) return null;

  if (durationType === "monthly") {
    return addDays(startDate, daysInStartMonth(startDate));
  }

  return addDays(startDate, 1);
};

const toMoneyNumber = (value: number | string | null | undefined) => {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export interface PendingBalanceInput {
  planLabel: string | null | undefined;
  amountPaid: number | string | null | undefined;
  existingPendingAmount?: number | string | null;
  planDefinition?: MembershipPlanRecord | MembershipPlanRecord[] | null;
}

export const calculatePendingBalance = ({
  planLabel,
  amountPaid,
  existingPendingAmount = 0,
  planDefinition,
}: PendingBalanceInput) => {
  const paidAmount = toMoneyNumber(amountPaid);
  const currentPending = toMoneyNumber(existingPendingAmount);
  const fullPlanPrice = getPlanPrice(planLabel, planDefinition);
  const expectedCharge = isPartialPlanLabel(planLabel)
    ? fullPlanPrice ?? paidAmount
    : paidAmount;

  return Math.max(0, roundMoney(currentPending + expectedCharge - paidAmount));
};

export interface PaymentPlanInput {
  plan_name?: string | null;
  amount?: number | string | null;
  membership_start_date?: PlanDateInput;
  membership_plans?: MembershipPlanRecord | MembershipPlanRecord[] | null;
}

export interface ProfilePlanSnapshot {
  plan?: string | null;
  plan_end_date?: PlanDateInput;
  pending_amount?: number | string | null;
}

export interface CalculatePaymentPlanUpdateInput {
  payment: PaymentPlanInput;
  profile?: ProfilePlanSnapshot | null;
  now?: PlanDateInput;
  planDefinition?: MembershipPlanRecord | MembershipPlanRecord[] | null;
}

export interface PaymentPlanUpdate {
  plan: string | null;
  plan_start_date: string;
  plan_end_date: string;
  status: "active";
  pending_amount: number;
}

export const calculatePaymentPlanUpdate = ({
  payment,
  profile,
  now,
  planDefinition,
}: CalculatePaymentPlanUpdateInput): PaymentPlanUpdate => {
  const rawPlanName = payment.plan_name ?? "";
  const dynamicPlan = normalizePlanDefinition(planDefinition ?? payment.membership_plans);
  const normalizedPlanLabel = dynamicPlan?.label ?? normalizePlanLabel(rawPlanName);
  const strippedPlanName = stripPartialPlanSuffix(rawPlanName);
  const currentEndDate = toValidDate(profile?.plan_end_date);
  const nowDate = toValidDate(now) ?? new Date();

  let startDate =
    toValidDate(payment.membership_start_date) ??
    (currentEndDate && currentEndDate > nowDate ? currentEndDate : null) ??
    nowDate;

  startDate = new Date(startDate);

  const calculatedEndDate = normalizedPlanLabel
    ? calculatePlanEndDate(startDate, normalizedPlanLabel, dynamicPlan)
    : null;
  const newEndDate = calculatedEndDate ?? currentEndDate ?? new Date(nowDate);
  const fallbackPlan = strippedPlanName || profile?.plan || null;

  return {
    plan: normalizedPlanLabel ?? fallbackPlan,
    plan_start_date: startDate.toISOString(),
    plan_end_date: newEndDate.toISOString(),
    status: "active",
    pending_amount: calculatePendingBalance({
      planLabel: rawPlanName,
      amountPaid: payment.amount,
      existingPendingAmount: profile?.pending_amount,
      planDefinition: dynamicPlan,
    }),
  };
};

export interface CalculatePaymentRevokeUpdateInput {
  payment: Pick<PaymentPlanInput, "plan_name" | "membership_plans">;
  profile: Pick<ProfilePlanSnapshot, "plan_end_date">;
  planDefinition?: MembershipPlanRecord | MembershipPlanRecord[] | null;
}

export const calculatePaymentRevokeUpdate = ({
  payment,
  profile,
  planDefinition,
}: CalculatePaymentRevokeUpdateInput) => {
  const currentEndDate = toValidDate(profile?.plan_end_date);
  if (!currentEndDate) return null;

  const dynamicPlan = normalizePlanDefinition(planDefinition ?? payment.membership_plans);
  const normalizedPlanLabel = dynamicPlan?.label ?? normalizePlanLabel(payment.plan_name);
  const rawPlanName = stripPartialPlanSuffix(payment.plan_name ?? "");
  const durationType = getPlanDurationType(normalizedPlanLabel ?? rawPlanName, dynamicPlan);
  if (!durationType && !rawPlanName) return null;

  const shouldTreatAsMonthly =
    durationType === "monthly" || /monthly/i.test(rawPlanName);

  const revokedEndDate = new Date(currentEndDate);
  if (shouldTreatAsMonthly) {
    revokedEndDate.setDate(
      revokedEndDate.getDate() - daysInStartMonth(revokedEndDate),
    );
  } else {
    revokedEndDate.setDate(revokedEndDate.getDate() - 1);
  }

  return { plan_end_date: revokedEndDate.toISOString() };
};
