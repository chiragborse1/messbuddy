import { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: ReactNode;
  className?: string;
  action?: ReactNode;
}

const PageShell = ({ children, title, subtitle, className = "", action }: PageShellProps) => {
  return (
    <div className={`min-h-screen pb-20 ${className}`}>
      {(title || subtitle || action) && (
        <header className="px-5 pt-12 pb-4 flex justify-between items-start">
          <div>
            {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
            {subtitle && <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          {action && <div className="mt-1">{action}</div>}
        </header>
      )}
      <div className="px-5">{children}</div>
    </div>
  );
};

export default PageShell;
