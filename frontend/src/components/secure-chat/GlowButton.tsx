import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const GlowButton = ({ children, className, variant = "primary", size = "md", ...props }: GlowButtonProps) => {
  const base = "relative font-semibold rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    primary: "gradient-btn text-primary-foreground hover:shadow-[0_0_30px_hsl(var(--neon-blue)/0.4),0_0_60px_hsl(var(--neon-purple)/0.2)]",
    secondary: "glass border-primary/30 text-foreground hover:border-primary/60 hover:shadow-[0_0_20px_hsl(var(--neon-blue)/0.2)]",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };

  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
};
