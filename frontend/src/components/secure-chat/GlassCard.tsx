import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  strong?: boolean;
}

export const GlassCard = ({ children, className, strong }: GlassCardProps) => (
  <div className={cn(
    "rounded-2xl",
    strong ? "glass-strong" : "glass",
    className
  )}>
    {children}
  </div>
);
