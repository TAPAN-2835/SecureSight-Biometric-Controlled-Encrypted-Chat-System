import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/secure-chat/GlassCard";
import { GlowButton } from "@/components/secure-chat/GlowButton";
import { SecurityBadge } from "@/components/secure-chat/SecurityBadge";
import { MessageBubble } from "@/components/secure-chat/MessageBubble";
import { FaceCameraWidget } from "@/components/secure-chat/FaceCameraWidget";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/cryptoService";
import { toast } from "sonner";
import {
  Search, Send, Paperclip, Phone, Video, MoreVertical,
  Shield, ChevronLeft, Users, LogOut, Loader2, Lock, Unlock, AlertTriangle
} from "lucide-react";
import { 
  loadFaceModels, startWebcam, getFaceDescriptor, 
  verifyFaceMatchAll, detectFaces 
} from "@/services/faceService";

const SHARED_KEY = "secure-chat-shared-secret-key"; // Shared key for development

type AuthState = "LOCKED" | "VERIFYING" | "UNLOCKED";

interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  online: boolean;
  unread: number;
}

interface Message {
  id: string;
  text: string;
  sent: boolean;
  time: string;
  sender_id?: string;
}

const ChatPage = () => {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>("LOCKED");
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [registeredDescriptors, setRegisteredDescriptors] = useState<number[][] | null>(null);
  const [isFaceLoading, setIsFaceLoading] = useState(true);
  const [confidence, setConfidence] = useState<number | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const matchScoreRef = useRef(0);
  const faceLostTimeRef = useRef<number | null>(null);

  const isSecure = authState === "UNLOCKED";

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      
      if (user) {
        setIsFaceLoading(true);
        try {
          // Fetch Real Contacts
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', user.id);
            
          if (profilesData) {
            const formatted = profilesData.map((p: any) => ({
              id: p.id,
              name: p.email ? p.email.split('@')[0] : 'User',
              avatar: p.email ? p.email.charAt(0).toUpperCase() : 'U',
              lastMessage: "Secure exchange available",
              time: "",
              online: true,
              unread: 0
            }));
            setContacts(formatted);
            if (formatted.length > 0) setSelectedContact(formatted[0]);
          }

          await loadFaceModels();
          const { data: faceData, error: faceError } = await supabase
            .from('faces')
            .select('encoding')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (faceError && faceError.code !== 'PGRST116') throw faceError;
          
          if (faceData) {
            setRegisteredDescriptors(faceData.encoding);
          }
        } catch (err) {
          console.error("Initialization error:", err);
        } finally {
          setIsFaceLoading(false);
        }
      }
    };
    init();

    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !registeredDescriptors || !videoRef.current) return;

    const startDetection = async () => {
      try {
        await startWebcam(videoRef.current!);
        
        detectionIntervalRef.current = setInterval(async () => {
          if (!videoRef.current) return;

          const faces = await detectFaces(videoRef.current);
          
          if (faces.length > 1) {
            setAuthState("LOCKED");
            setLockReason("MULTIPLE_FACES");
            setConfidence(null);
            matchScoreRef.current = -2;
            faceLostTimeRef.current = null;
            return;
          }

          if (faces.length === 0) {
            if (!faceLostTimeRef.current) {
              faceLostTimeRef.current = Date.now();
            }
            const timeSinceLost = Date.now() - faceLostTimeRef.current;
            
            if (timeSinceLost > 800) {
              setAuthState("LOCKED");
              setLockReason("NO_FACE");
              setConfidence(null);
              matchScoreRef.current = -2;
            }
            return;
          }

          faceLostTimeRef.current = null;

          const currentDescriptor = await getFaceDescriptor(videoRef.current);
          if (currentDescriptor && registeredDescriptors) {
            const result = verifyFaceMatchAll(currentDescriptor, registeredDescriptors);
            setConfidence(result.confidence);
            
            if (result.isMatch) {
              matchScoreRef.current = Math.min(2, matchScoreRef.current + 1);
            } else {
              matchScoreRef.current = Math.max(-2, matchScoreRef.current - 1);
            }
            
            if (matchScoreRef.current >= 2) {
              setAuthState("UNLOCKED");
              setLockReason(null);
            } else if (matchScoreRef.current <= -2) {
              setAuthState("LOCKED");
              setLockReason("IDENTITY_MISMATCH");
            } else if (authState === "LOCKED") {
              setAuthState("VERIFYING");
            }
          }
        }, 250);
      } catch (err) {
        console.error("Detection loop error:", err);
        setAuthState("LOCKED");
        setLockReason("CAMERA_ERROR");
      }
    };
    
    startDetection();

    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    };
  }, [currentUser, registeredDescriptors, authState]);

  useEffect(() => {
    if (!currentUser) return;

    fetchMessages();

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages'
      }, (payload) => {
        const newMessage = payload.new;
        if (newMessage.sender_id === currentUser.id || newMessage.receiver_id === currentUser.id) {
          decrypt(newMessage.payload, SHARED_KEY).then(decryptedText => {
            setMessages(prev => [...prev, {
              id: newMessage.id,
              text: decryptedText,
              sent: newMessage.sender_id === currentUser.id,
              time: new Date(newMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              sender_id: newMessage.sender_id
            }]);
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, selectedContact]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    if (!currentUser || !selectedContact) return;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedContact.id}),and(sender_id.eq.${selectedContact.id},receiver_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      const decryptedMessages = await Promise.all(data.map(async m => ({
        id: m.id,
        text: await decrypt(m.payload, SHARED_KEY),
        sent: m.sender_id === currentUser.id,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sender_id: m.sender_id
      })));
      setMessages(decryptedMessages);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentUser || !selectedContact) return;

    const encryptedPayload = await encrypt(messageInput.trim(), SHARED_KEY);
    const newMessage = {
      sender_id: currentUser.id,
      receiver_id: selectedContact.id,
      payload: encryptedPayload,
    };

    const { error } = await supabase.from('messages').insert([newMessage]);

    if (error) {
      toast.error("Failed to send message");
    } else {
      setMessageInput("");
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Successfully logged out");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Failed to logout");
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden relative font-sans">
      <div className={cn(
        "flex flex-col border-r border-border/50 bg-card/30 backdrop-blur-xl transition-all duration-300",
        showSidebar ? "w-80" : "w-0 overflow-hidden",
        "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40",
        !showSidebar && "max-md:hidden"
      )}>
        <div className="p-4 border-b border-border/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl gradient-btn flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">Secure<span className="text-gradient">Chat</span></span>
            </div>
            <button className="md:hidden text-muted-foreground" onClick={() => setShowSidebar(false)}>
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-muted/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border/30 focus:border-primary/40 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {filteredContacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => { setSelectedContact(contact); setShowSidebar(window.innerWidth >= 768); }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 hover:bg-muted/30",
                selectedContact.id === contact.id && "bg-muted/40 border-r-2 border-primary"
              )}
            >
              <div className="relative shrink-0">
                <div className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold",
                  "bg-gradient-to-br from-primary/30 to-secondary/30 text-foreground"
                )}>
                  {contact.avatar}
                </div>
                {contact.online && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-accent border-2 border-card" />
                )}
              </div>

              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">{contact.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{contact.time}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{contact.lastMessage}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-16 flex items-center justify-between px-4 border-b border-border/30 glass-strong shrink-0">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-muted-foreground mr-1" onClick={() => setShowSidebar(true)}>
              <Users className="w-5 h-5" />
            </button>
            {selectedContact ? (
              <>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-sm font-semibold text-foreground">
                  {selectedContact.avatar}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{selectedContact.name}</h3>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedContact.online ? "Online" : "Last seen recently"}
                  </p>
                </div>
              </>
            ) : (
              <div className="text-sm font-medium text-muted-foreground">
                No active contacts
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SecurityBadge isSecure={isSecure} />
            <button onClick={handleLogout} className="p-2 rounded-xl hover:bg-muted/50 text-destructive transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className={cn(
          "px-4 py-1.5 flex items-center justify-between transition-all duration-700 text-[10px] font-bold uppercase tracking-widest border-b border-white/5",
          authState === "UNLOCKED" ? "bg-green-500/5 text-green-500" : 
          authState === "VERIFYING" ? "bg-indigo-500/5 text-indigo-400 animate-pulse" : 
          "bg-red-500/5 text-red-500"
        )}>
          <div className="flex items-center gap-2">
            {authState === "UNLOCKED" ? (
              <><Unlock className="w-3 h-3" /> Secure View Active</>
            ) : authState === "VERIFYING" ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Verifying Identity...</>
            ) : (
              <><Lock className="w-3 h-3" /> 
                {lockReason === "MULTIPLE_FACES" ? "SHOULDER SURFING DETECTED" : 
                 lockReason === "NO_FACE" ? "VAULT LOCKED" : 
                 lockReason === "IDENTITY_MISMATCH" ? "VERIFICATION FAILED" :
                 "Biometric Lock Active"}
              </>
            )}
          </div>
          {confidence !== null && authState !== "LOCKED" && (
            <div className="flex items-center gap-2 font-mono opacity-80">
              <span>MATCH:</span>
              <span className={cn(
                "font-bold",
                confidence > 80 ? "text-green-500" : confidence > 60 ? "text-yellow-500" : "text-red-500"
              )}>{confidence}%</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6" ref={scrollRef}>
          {authState !== "UNLOCKED" && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4 blur-transition">
               <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  {lockReason === "MULTIPLE_FACES" ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <Lock className="w-5 h-5 text-red-500" />}
               </div>
               <div className="text-center">
                 <h4 className="text-xs font-bold text-slate-300 mb-1 uppercase tracking-widest">Messages Hidden</h4>
                 <p className="text-xs text-slate-500 max-w-[200px]">
                   {lockReason === "MULTIPLE_FACES" ? "Access suspended. Multiple faces detected." : 
                    "Biometric authentication required to reveal messages."}
                 </p>
               </div>
            </div>
          )}

          {messages.length === 0 && authState === "UNLOCKED" && (
            <div className="text-center py-10 text-muted-foreground animate-fade-in">
              <p className="text-sm">No messages yet. Start a secure conversation.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              text={isSecure ? msg.text : "••••••••••••••••••••"}
              sent={msg.sent}
              time={msg.time}
              isSecure={isSecure}
              index={i}
            />
          ))}
        </div>

        <div className="p-4 border-t border-border/30 bg-card/20 shrink-0">
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
            <button type="button" className="p-2.5 rounded-xl hover:bg-muted/50 text-muted-foreground transition-colors">
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={isSecure ? "Type a secure message..." : "Unlock to send messages"}
              disabled={!isSecure}
              className={cn(
                "flex-1 bg-muted/40 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none border border-border/30 transition-all duration-300 focus:border-primary/40 focus:shadow-[0_0_15px_hsl(var(--neon-blue)/0.1)]",
                !isSecure && "cursor-not-allowed opacity-50"
              )}
            />
            <GlowButton type="submit" size="sm" className="px-4 py-3 rounded-xl" disabled={!isSecure}>
              <Send className="w-4 h-4" />
            </GlowButton>
          </form>
        </div>
      </div>

      <FaceCameraWidget isSecure={isSecure} onToggle={() => {}} />
      
      <video 
        ref={videoRef}
        autoPlay 
        muted 
        playsInline 
        className="fixed bottom-0 right-0 w-[1px] h-[1px] opacity-0 pointer-events-none"
      />
      
      {isFaceLoading && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center">
          <div className="relative mb-8">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <Shield className="absolute inset-0 m-auto w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Initializing Vault</h2>
          <p className="text-muted-foreground text-sm">Loading neural weights and secure protocols...</p>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
