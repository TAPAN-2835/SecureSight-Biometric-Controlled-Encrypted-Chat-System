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
      ? "bg-green-500/10 text-green-500 border border-green-500/20"
      : "bg-red-500/10 text-red-500 border border-red-500/20",
    className
  )}>
    <div className="relative">
      {isSecure ? <Shield className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
    </div>
    {isSecure ? "🔓 Secure View Enabled" : "🔒 Face Not Verified"}
  </div>
);
