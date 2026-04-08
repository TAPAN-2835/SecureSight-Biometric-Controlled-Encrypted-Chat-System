import { cn } from "@/lib/utils";
import { Camera, Eye, EyeOff } from "lucide-react";

interface FaceCameraWidgetProps {
  isSecure: boolean;
  onToggle: () => void;
}

export const FaceCameraWidget = ({ isSecure, onToggle }: FaceCameraWidgetProps) => (
  <button
    onClick={onToggle}
    className={cn(
      "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer",
      "glass-strong",
      isSecure
        ? "border-accent/50 neon-glow-green"
        : "border-destructive/50 neon-glow-red"
    )}
    title="Toggle face detection (demo)"
  >
    <div className="relative">
      <Camera className={cn(
        "w-5 h-5 transition-colors duration-500",
        isSecure ? "text-accent" : "text-destructive"
      )} />
      <div className="absolute -top-1 -right-1">
        {isSecure
          ? <Eye className="w-3 h-3 text-accent" />
          : <EyeOff className="w-3 h-3 text-destructive" />
        }
      </div>
    </div>
    {/* Pulse ring */}
    <div className={cn(
      "absolute inset-0 rounded-full animate-ping opacity-20",
      isSecure ? "bg-accent" : "bg-destructive"
    )} />
  </button>
);
