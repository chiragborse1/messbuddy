import { Home, UtensilsCrossed, IndianRupee, CalendarOff, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { icon: Home, label: "Home", path: "/student" },
  { icon: UtensilsCrossed, label: "Menu", path: "/student/menu" },
  { icon: IndianRupee, label: "Fees", path: "/student/fees" },
  { icon: CalendarOff, label: "Leave", path: "/student/leave" },
  { icon: User, label: "Profile", path: "/student/profile" },
];

const StudentBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isTabActive = (path: string) => location.pathname === path || (path !== "/student" && location.pathname.startsWith(`${path}/`));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pointer-events-none">
      <div className="grid grid-cols-5 gap-1 max-w-lg mx-auto rounded-3xl border border-border/70 bg-card/95 p-1.5 shadow-lg backdrop-blur-xl pointer-events-auto">
        {tabs.map((tab) => {
          const isActive = isTabActive(tab.path);
          return (
            <button
              key={tab.path}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(tab.path)}
              className={`min-w-0 flex flex-col items-center gap-0.5 rounded-2xl py-2 px-1.5 transition-all outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-semibold leading-none truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default StudentBottomNav;
