import { cn } from "@/lib/utils";
import { Shield, ShieldAlert } from "lucide-react";

interface SecurityBadgeProps {
  isSecure: boolean;
  className?: string;
}

export const SecurityBadge = ({ isSecure, className }: SecurityBadgeProps) => (
  <div className={cn(
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-500",
    isSecure
      ? "bg-accent/10 text-accent border border-accent/30 neon-glow-green"
      : "bg-destructive/10 text-destructive border border-destructive/30 neon-glow-red",
    className
  )}>
    <div className="relative">
      {isSecure ? <Shield className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
      <div className={cn(
        "absolute inset-0 rounded-full animate-ping",
        isSecure ? "bg-accent/30" : "bg-destructive/30"
      )} />
    </div>
    {isSecure ? "🔓 Secure View" : "🔒 Face Not Verified"}
  </div>
);
