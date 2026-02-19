import PageShell from "@/components/PageShell";
import StudentBottomNav from "@/components/StudentBottomNav";
import { MessageCircle, Phone, Instagram } from "lucide-react";

const helpItems = [
  {
    icon: MessageCircle,
    label: "WhatsApp",
    subtitle: "Chat with us",
    color: "bg-green-500/10 text-green-600",
    href: "https://wa.me/919359447581",
  },
  {
    icon: Phone,
    label: "Call Us",
    subtitle: "+91 93594 47581",
    color: "bg-blue-500/10 text-blue-600",
    href: "tel:+919359447581",
  },
  {
    icon: Instagram,
    label: "Instagram",
    subtitle: "@akshay_patil8888",
    color: "bg-pink-500/10 text-pink-600",
    href: "https://www.instagram.com/akshay_patil8888?igsh=MWUwZWwxZGxmd2d5Yg==",
  },
];

const StudentHelp = () => {
  return (
    <>
      <PageShell title="Help & Support" subtitle="We're here for you">
        <div className="space-y-3 animate-slide-up mt-4">
          {helpItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-card rounded-2xl border border-border/50 p-5 shadow-sm hover:border-primary/30 transition-colors"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${item.color}`}>
                <item.icon className="w-7 h-7" />
              </div>
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
              </div>
            </a>
          ))}
        </div>
      </PageShell>
      <StudentBottomNav />
    </>
  );
};

export default StudentHelp;
