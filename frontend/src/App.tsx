import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "./lib/supabase";
import LoginPage from "./pages/LoginPage";
import FaceRegisterPage from "./pages/FaceRegisterPage";
import ChatPage from "./pages/ChatPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasFaceRegistered, setHasFaceRegistered] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Fail-safe: never wait more than 3.5 seconds to unlock the UI
    const safetyTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 3500);

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      if (session) {
        checkFaceRegistration(session.user);
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error("Auth session check failed:", err);
      if (mounted) setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      if (session) {
        checkFaceRegistration(session.user);
      } else {
        setHasFaceRegistered(false);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const checkFaceRegistration = async (user: any) => {
    try {
      // 1. Ensure a profile row exists for messaging logic
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle(); 
      
      if (!profile) {
        console.log("No profile found for user, creating base profile...");
        await supabase.from('profiles').insert([{ 
          id: user.id, 
          email: user.email, 
          has_face_registered: false 
        }]);
      }

      // 2. Rely on the Vault (faces table) as the true source of truth for Biometrics
      const { data: faceRecord } = await supabase
        .from('faces')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (faceRecord && faceRecord.length > 0) {
        setHasFaceRegistered(true);
      } else {
        setHasFaceRegistered(false);
      }
    } catch (err: any) {
      console.error("Critical: Database Query Failed.", err.message || err);
      setHasFaceRegistered(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading Secure Environment...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            
            {/* If NOT logged in -> LoginPage. If logged in, redirect based on face status */}
            <Route 
              path="/" 
              element={
                !session ? (
                  <LoginPage />
                ) : hasFaceRegistered ? (
                  <Navigate to="/chat" />
                ) : (
                  <Navigate to="/face-register" />
                )
              } 
            />

            {/* Requires Auth. If registered, go to chat */}
            <Route 
              path="/face-register" 
              element={
                session ? (
                  hasFaceRegistered ? <Navigate to="/chat" /> : <FaceRegisterPage />
                ) : (
                  <Navigate to="/" />
                )
              } 
            />

            {/* Requires Auth AND Face Registration */}
            <Route 
              path="/chat" 
              element={
                session ? (
                  hasFaceRegistered ? <ChatPage /> : <Navigate to="/face-register" />
                ) : (
                  <Navigate to="/" />
                )
              } 
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
