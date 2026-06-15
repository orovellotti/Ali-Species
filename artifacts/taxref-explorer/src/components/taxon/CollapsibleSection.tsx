import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({ icon, title, count, children, defaultOpen = false, className = "" }: {
  icon: ReactNode;
  title: string;
  count?: number | string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-card rounded-2xl border border-border shadow-sm overflow-hidden ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-5 text-left hover:bg-muted/30 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold text-foreground uppercase tracking-wider flex-1">{title}</span>
        {count != null && (
          <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-border/50 pt-4">{children}</div>}
    </div>
  );
}
