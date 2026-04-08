import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedBackground } from "@/components/secure-chat/AnimatedBackground";
import { GlassCard } from "@/components/secure-chat/GlassCard";
import { GlowButton } from "@/components/secure-chat/GlowButton";
import { FloatingInput } from "@/components/secure-chat/FloatingInput";
import { Shield, Lock, Fingerprint, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const LoginPage = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
            },
          },
        });
        if (error) throw error;
        
        if (data.user) {
          // Create the profile entry immediately with required email field
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([{ 
              id: data.user.id, 
              email: data.user.email,
              has_face_registered: false 
            }]);
          
          if (profileError) {
            console.warn("Profile creation failed, App will retry on next check:", profileError);
          }
        }

        toast.success("Account created! You can now register your face.");
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-background">
      <AnimatedBackground />

      {/* Left Panel - Branding */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative z-10 p-12">
        <div className="animate-fade-in max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-black/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">
              Secure<span className="text-gradient">Chat</span>
            </h1>
          </div>

          <h2 className="text-4xl font-bold text-foreground leading-tight mb-4">
            Your messages.{" "}
            <span className="text-gradient">Your face.</span>{" "}
            Your privacy.
          </h2>

          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            AI-powered face detection ensures only you can read your messages. 
            Next-gen encryption meets biometric security.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3">
            {[
              { icon: Lock, label: "End-to-End Encrypted" },
              { icon: Fingerprint, label: "Face ID Protection" },
              { icon: MessageSquare, label: "Real-time Messaging" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="glass rounded-full px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="w-4 h-4 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center relative z-10 p-6">
        <GlassCard strong className="w-full max-w-md p-8 animate-scale-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-6 justify-center">
            <div className="w-10 h-10 rounded-xl gradient-btn flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Secure<span className="text-gradient">Chat</span></span>
          </div>

          {/* Tab toggle */}
          <div className="flex rounded-xl bg-muted/50 p-1 mb-8">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                isLogin ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                !isLogin ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="animate-fade-in">
                <FloatingInput label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <FloatingInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <FloatingInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

            {isLogin && (
              <div className="text-right">
                <button type="button" className="text-xs text-primary hover:text-primary/80 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <GlowButton type="submit" className="w-full mt-2" disabled={isLoading}>
              {isLoading ? (isLogin ? "Signing in..." : "Creating account...") : (isLogin ? "Sign In" : "Create Account")}
            </GlowButton>
          </form>



          <p className="text-center text-xs text-muted-foreground mt-6">
            By continuing, you agree to our Terms & Privacy Policy
          </p>
        </GlassCard>
      </div>
    </div>
  );
};

export default LoginPage;
