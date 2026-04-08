import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  text: string;
  sent: boolean;
  time: string;
  isSecure: boolean;
  index?: number;
}

const scrambleText = (text: string) => {
  const chars = "█▓▒░╔╗╚╝║═╬╣╠╦╩";
  return text.split("").map(() => chars[Math.floor(Math.random() * chars.length)]).join("");
};

export const MessageBubble = ({ text, sent, time, isSecure, index = 0 }: MessageBubbleProps) => (
  <div
    className={cn("flex animate-message-in", sent ? "justify-end" : "justify-start")}
    style={{ animationDelay: `${index * 0.05}s` }}
  >
    <div className={cn(
      "max-w-[75%] rounded-2xl px-4 py-2.5 transition-all duration-500",
      sent
        ? "bg-gradient-to-r from-primary/80 to-secondary/80 text-primary-foreground"
        : "glass"
    )}>
      <p className={cn(
        "text-sm leading-relaxed transition-all duration-500",
        !isSecure && "blur-[6px] select-none"
      )}>
        {isSecure ? text : scrambleText(text)}
      </p>
      <p className={cn(
        "text-[10px] mt-1 transition-all duration-500",
        sent ? "text-primary-foreground/60" : "text-muted-foreground",
        !isSecure && "blur-[4px]"
      )}>
        {time}
      </p>
    </div>
  </div>
);
