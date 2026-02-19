import { LayoutDashboard, Users, UtensilsCrossed, IndianRupee, User, PieChart } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { icon: LayoutDashboard, label: "Home", path: "/admin" },
  { icon: Users, label: "Students", path: "/admin/students" },
  { icon: UtensilsCrossed, label: "Menu", path: "/admin/menu" },
  { icon: IndianRupee, label: "Pay", path: "/admin/payments" },
  { icon: PieChart, label: "Stats", path: "/admin/analytics" },
  { icon: User, label: "Profile", path: "/admin/profile" },
];

const AdminBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/60 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-3 transition-colors ${isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default AdminBottomNav;
