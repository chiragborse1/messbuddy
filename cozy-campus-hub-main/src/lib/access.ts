import { UserData } from "@/contexts/user";

const BLOCKED_STUDENT_STATUSES = new Set(["pending", "rejected", "suspended", "deleted"]);

export const hasAdminAccess = (user: Pick<UserData, "role"> | null | undefined) =>
  user?.role === "admin" || user?.role === "developer";

export const hasActiveStudentAccess = (
  user: Pick<UserData, "role" | "status"> | null | undefined,
) => user?.role === "student" && !BLOCKED_STUDENT_STATUSES.has(user.status || "");

export const getBlockedStudentStatusMessage = (status: string | null | undefined) => {
  if (status === "pending") {
    return {
      title: "Account Pending",
      description: "Your account is awaiting admin approval.",
    };
  }

  if (status === "deleted") {
    return {
      title: "Account Removed",
      description: "Your account has been removed. Please contact admin.",
    };
  }

  if (status === "suspended") {
    return {
      title: "Account Suspended",
      description: "Please contact admin.",
    };
  }

  if (status === "rejected") {
    return {
      title: "Account Rejected",
      description: "Please contact admin.",
    };
  }

  return null;
};
