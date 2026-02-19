interface StatusBadgeProps {
  status: "active" | "pending" | "expired" | "approved" | "rejected" | "on-leave" | "suspended" | string;
}

const statusStyles: Record<string, string> = {
  active: "status-active",
  approved: "status-active",
  pending: "status-pending",
  expired: "status-expired",
  rejected: "status-expired",
  suspended: "bg-red-100 text-red-700 border border-red-200",
  deleted: "bg-gray-200 text-gray-700 border border-gray-300",
  "on-leave": "bg-primary/10 text-primary",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  approved: "Approved",
  pending: "Pending",
  expired: "Expired",
  rejected: "Rejected",
  suspended: "Suspended",
  deleted: "Deleted",
  "on-leave": "On Leave",
};

const StatusBadge = ({ status }: StatusBadgeProps) => {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
};

export default StatusBadge;
