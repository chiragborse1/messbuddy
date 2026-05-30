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
          const isActive = location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`);
          return (
            <button
              key={tab.path}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl py-2.5 px-3 transition-colors outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card active:bg-muted/50 ${isActive
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
