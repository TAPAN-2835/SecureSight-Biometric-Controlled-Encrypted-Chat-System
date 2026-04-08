import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedBackground } from "@/components/secure-chat/AnimatedBackground";
import { GlassCard } from "@/components/secure-chat/GlassCard";
import { GlowButton } from "@/components/secure-chat/GlowButton";
import { Check, Scan, User, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { loadFaceModels, startWebcam, getFaceDescriptor } from "@/services/faceService";

type RegistrationStep = "loading" | "idle" | "front" | "smile" | "left" | "right" | "complete";

const FaceRegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<RegistrationStep>("idle");
  const [isUpdating, setIsUpdating] = useState(false);
  const [capturedDescriptors, setCapturedDescriptors] = useState<number[][]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCapturingRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      setStep("loading");
      try {
        await loadFaceModels();
        setStep("idle");
      } catch (err) {
        toast.error("Failed to load face detection models.");
        setStep("idle");
      }
    };
    init();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRegistration = async () => {
    if (!videoRef.current) return;
    
    try {
      const stream = await startWebcam(videoRef.current);
      streamRef.current = stream;
      
      // Ensure video is ready before starting the process
      videoRef.current.onloadedmetadata = () => {
        setStep("front");
      };
      
      if (videoRef.current.readyState >= 2) {
        setStep("front");
      }
    } catch (err) {
      toast.error("Webcam access required for registration.");
      setStep("idle");
    }
  };

  useEffect(() => {
    if (["front", "smile", "left", "right"].includes(step) && !isCapturingRef.current) {
      const captureLoop = async () => {
        if (!videoRef.current || isCapturingRef.current) return;
        
        if (videoRef.current.videoWidth === 0) {
          // Wait for video dimensions
          setTimeout(captureLoop, 300);
          return;
        }
        
        const descriptor = await getFaceDescriptor(videoRef.current);
        if (descriptor) {
          isCapturingRef.current = true;
          const descriptorArray = Array.from(descriptor);
          
          setCapturedDescriptors(prev => [...prev, descriptorArray]);
          console.log(`Captured ${step} orientation`);
          
          // Show feedback before moving to next step
          setTimeout(() => {
            isCapturingRef.current = false;
            if (step === "front") setStep("smile");
            else if (step === "smile") setStep("left");
            else if (step === "left") setStep("right");
            else if (step === "right") {
              setStep("complete");
              toast.success("All angles captured successfully!");
            }
          }, 1500);
        } else {
          // Retry detection
          setTimeout(captureLoop, 300);
        }
      };
      
      captureLoop();
    }
  }, [step]);

  useEffect(() => {
    if (step === "complete" && capturedDescriptors.length === 4 && !isUpdating) {
      handleSaveRegistration();
    }
  }, [step, capturedDescriptors, isUpdating]);

  const handleSaveRegistration = async () => {
    if (capturedDescriptors.length < 4) return;
    
    setIsUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      // Store multiple descriptors in the 'faces' table as an array of arrays
      const { error: faceError } = await supabase
        .from('faces')
        .insert([{
          user_id: user.id,
          encoding: capturedDescriptors // JSONB array of number arrays
        }]);

      if (faceError) throw faceError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ has_face_registered: true })
        .eq('id', user.id);

      if (profileError) throw profileError;
      
      toast.success("Security profile created!");
      
      // Force reload to let App.tsx re-fetch profile and cleanly route to /chat
      window.location.href = "/chat";
    } catch (error: any) {
      toast.error("Database Error: " + (error.message || "Failed to finalize registration. Please check Supabase policies."));
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      <AnimatedBackground />

      <div className="relative z-10 w-full max-w-lg px-6 animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Biometric Enrollment</h1>
          <p className="text-muted-foreground text-sm">Capturing multiple angles for maximum security</p>
        </div>

        <GlassCard strong className="p-8 flex flex-col items-center">
          <div className="relative w-56 h-56 mb-8">
            <div className={cn(
              "absolute inset-0 rounded-full border-2 border-dashed transition-all duration-500",
              ["front", "smile", "left", "right"].includes(step) && "border-primary animate-spin-slow",
              step === "complete" && "border-accent",
              step === "idle" && "border-border"
            )} />

            <div className={cn(
              "absolute inset-2 rounded-full transition-all duration-700",
              ["front", "smile", "left", "right"].includes(step) && "neon-glow-blue animate-pulse-glow",
              step === "complete" && "neon-glow-green",
            )} />

            <div className={cn(
              "absolute inset-4 rounded-full flex items-center justify-center transition-all duration-500 overflow-hidden bg-muted/40"
            )}>
              <video 
                ref={videoRef}
                autoPlay 
                muted 
                playsInline
                className={cn(
                  "absolute inset-0 w-full h-full object-cover scale-x-[-1]",
                  ["front", "smile", "left", "right", "complete"].includes(step) ? "opacity-100" : "opacity-0"
                )}
              />

              {isCapturingRef.current && (
                <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in zoom-in duration-300">
                  <div className="bg-primary/80 p-3 rounded-full">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                </div>
              )}

              {step === "idle" && <User className="w-16 h-16 text-muted-foreground/40" />}
              {step === "loading" && <Loader2 className="w-10 h-10 text-primary animate-spin" />}
            </div>

            {/* Instruction Labels */}
            {["front", "smile", "left", "right"].includes(step) && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background/80 backdrop-blur px-4 py-1.5 rounded-full border border-primary/30 text-xs font-bold text-primary animate-bounce">
                {step === "front" && "LOOK STRAIGHT AT CAMERA"}
                {step === "smile" && "GIVE A SLIGHT SMILE"}
                {step === "left" && "TURN HEAD SLIGHTLY LEFT"}
                {step === "right" && "TURN HEAD SLIGHTLY RIGHT"}
              </div>
            )}
          </div>

          <div className="w-full space-y-6">
            <div className="flex justify-between items-center px-2">
              {[
                { id: "front", label: "Neutral" },
                { id: "smile", label: "Smile" },
                { id: "left", label: "Left" },
                { id: "right", label: "Right" }
              ].map((s, i) => (
                <div key={s.id} className="flex flex-col items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                    capturedDescriptors.length > i 
                      ? "bg-accent/20 border-accent text-accent" 
                      : step === s.id 
                        ? "bg-primary/20 border-primary text-primary animate-pulse" 
                        : "border-muted text-muted-foreground"
                  )}>
                    {capturedDescriptors.length > i ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-70">{s.label}</span>
                </div>
              ))}
            </div>

            <p className="text-sm font-medium text-center text-muted-foreground min-h-[40px]">
              {step === "loading" && "Initializing security modules..."}
              {step === "idle" && "We need 4 quick snapshots to secure your identity."}
              {step === "front" && !isCapturingRef.current && "Stay still, capturing neutral face..."}
              {step === "smile" && !isCapturingRef.current && "Good! Now give a slight smile..."}
              {step === "left" && !isCapturingRef.current && "Now turn your head slightly to the left..."}
              {step === "right" && !isCapturingRef.current && "Almost done! Turn slightly to the right..."}
              {isCapturingRef.current && "Snapshot captured!"}
              {step === "complete" && "All angles secured. Encryption keys ready."}
            </p>

            {step === "idle" && (
              <GlowButton onClick={startRegistration} className="w-full">
                Begin Secure Setup
              </GlowButton>
            )}

            {step === "complete" && (
              <GlowButton onClick={handleSaveRegistration} className="w-full animate-fade-in" disabled={isUpdating}>
                {isUpdating ? "Securing Vault..." : "Finalize & Enter Chat"}
                {!isUpdating && <ArrowRight className="ml-2 w-4 h-4" />}
              </GlowButton>
            )}
            
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/");
              }}
              className="w-full mt-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel Registration
            </button>
          </div>
        </GlassCard>
      </div>

      <style>{`
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FaceRegisterPage;
