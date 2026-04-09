import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GlowButton } from "@/components/secure-chat/GlowButton";
import { SecurityBadge } from "@/components/secure-chat/SecurityBadge";
import { MessageBubble } from "@/components/secure-chat/MessageBubble";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/cryptoService";
import { toast } from "sonner";
import {
  Search, Send,
  Shield, ChevronLeft, Users, LogOut, Loader2, Lock, Unlock, AlertTriangle
} from "lucide-react";
import {
  loadFaceModels, startWebcam, getFaceDescriptor,
  verifyFaceMatchAll, detectFaces
} from "@/services/faceService";

const SHARED_KEY = "secure-chat-shared-secret-key";
// Minimum confidence % required to keep the screen unlocked.
// 45 % is practical for real webcam / lighting conditions with TinyFaceDetector.
const CONFIDENCE_UNLOCK_THRESHOLD = 45;

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
  // Keep refs in sync with state to avoid stale closures in detection interval
  const authStateRef = useRef<AuthState>("LOCKED");

  const isSecure = authState === "UNLOCKED";

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── Helper: set auth state and keep ref in sync ──────────────────────
  const setAuth = useCallback((state: AuthState, reason: string | null = null) => {
    authStateRef.current = state;
    setAuthState(state);
    setLockReason(reason);
  }, []);

  // ── Profile → Contact formatter ───────────────────────────────────────
  const formatProfile = (p: any): Contact => ({
    id: p.id,
    name: p.email ? p.email.split("@")[0] : "User",
    avatar: p.email ? p.email.charAt(0).toUpperCase() : "U",
    lastMessage: "Secure exchange available",
    time: "",
    online: true,
    unread: 0,
  });

  // ── Init: load user, contacts, face models ────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      if (user) {
        setIsFaceLoading(true);
        try {
          // Load initial contacts (everyone except self)
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("*")
            .neq("id", user.id);

          if (profilesData) {
            const formatted = profilesData.map(formatProfile);
            setContacts(formatted);
            if (formatted.length > 0) setSelectedContact(formatted[0]);
          }

          // Load face models + current user's registered descriptors
          await loadFaceModels();
          const { data: faceData, error: faceError } = await supabase
            .from("faces")
            .select("encoding")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (faceError && faceError.code !== "PGRST116") throw faceError;

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

  // ── Real-time: auto-update contact list when new users register ───────
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel("profiles-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          const record = payload.new as any;
          // Ignore our own profile changes
          if (!record || record.id === currentUser.id) return;

          if (payload.eventType === "INSERT") {
            setContacts((prev) => {
              // Don't add duplicates
              if (prev.some((c) => c.id === record.id)) return prev;
              return [...prev, formatProfile(record)];
            });
          } else if (payload.eventType === "UPDATE") {
            setContacts((prev) =>
              prev.map((c) => (c.id === record.id ? { ...c, ...formatProfile(record) } : c))
            );
          } else if (payload.eventType === "DELETE") {
            const oldRecord = payload.old as any;
            setContacts((prev) => prev.filter((c) => c.id !== oldRecord?.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // ── Face detection loop (runs once when user + descriptors are ready) ─
  useEffect(() => {
    if (!currentUser || !registeredDescriptors || !videoRef.current) return;

    // Prevent starting multiple loops
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);

    const startDetection = async () => {
      try {
        await startWebcam(videoRef.current!);

        detectionIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.videoWidth === 0) return;

          // ── 1. Count all visible faces ────────────────────────────────
          const faces = await detectFaces(videoRef.current);
          console.debug(`[FaceAuth] faces detected: ${faces.length}`);

          if (faces.length > 1) {
            // Multiple faces / another person's head or shoulder in frame
            setAuth("LOCKED", "MULTIPLE_FACES");
            setConfidence(null);
            matchScoreRef.current = -3; // Instant hard lock
            faceLostTimeRef.current = null;
            return;
          }

          // ── 2. No face in frame ───────────────────────────────────────
          if (faces.length === 0) {
            if (!faceLostTimeRef.current) {
              faceLostTimeRef.current = Date.now();
            }
            const timeSinceLost = Date.now() - faceLostTimeRef.current;

            if (timeSinceLost > 1200) {
              setAuth("LOCKED", "NO_FACE");
              setConfidence(null);
              matchScoreRef.current = Math.max(-3, matchScoreRef.current - 1);
            }
            return;
          }

          faceLostTimeRef.current = null;

          // ── 3. Get descriptor and verify identity ─────────────────────
          const currentDescriptor = await getFaceDescriptor(videoRef.current);
          if (currentDescriptor && registeredDescriptors) {
            const result = verifyFaceMatchAll(currentDescriptor, registeredDescriptors);
            setConfidence(result.confidence);
            console.debug(`[FaceAuth] distance: ${result.distance.toFixed(3)}, confidence: ${result.confidence}%, match: ${result.isMatch}`);

            const meetsThreshold =
              result.isMatch && result.confidence >= CONFIDENCE_UNLOCK_THRESHOLD;

            if (meetsThreshold) {
              matchScoreRef.current = Math.min(3, matchScoreRef.current + 1);
            } else {
              matchScoreRef.current = Math.max(-3, matchScoreRef.current - 1);
            }

            // Unlock after just 1 consecutive positive match for fast response
            if (matchScoreRef.current >= 1) {
              if (authStateRef.current !== "UNLOCKED") {
                setAuth("UNLOCKED", null);
              }
            } else if (matchScoreRef.current <= -2) {
              if (authStateRef.current !== "LOCKED") {
                setAuth("LOCKED", "IDENTITY_MISMATCH");
              }
            } else if (authStateRef.current === "LOCKED") {
              setAuth("VERIFYING", null);
            }
          }
        }, 350);
      } catch (err) {
        console.error("Detection loop error:", err);
        setAuth("LOCKED", "CAMERA_ERROR");
      }
    };

    startDetection();

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [currentUser, registeredDescriptors]); // ← authState intentionally removed to prevent interval restart

  // ── Fetch messages when contact changes ───────────────────────────────
  useEffect(() => {
    if (!currentUser || !selectedContact) return;
    fetchMessages();
  }, [currentUser, selectedContact]);

  // ── Real-time messages subscription ───────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel("public:messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMessage = payload.new;
          if (
            newMessage.sender_id === currentUser.id ||
            newMessage.receiver_id === currentUser.id
          ) {
            // Only add if belongs to the active conversation
            const isCurrentConversation =
              (newMessage.sender_id === currentUser.id &&
                newMessage.receiver_id === selectedContact?.id) ||
              (newMessage.sender_id === selectedContact?.id &&
                newMessage.receiver_id === currentUser.id);

            if (isCurrentConversation) {
              decrypt(newMessage.payload, SHARED_KEY).then((decryptedText) => {
                setMessages((prev) => {
                  // Deduplicate
                  if (prev.some((m) => m.id === newMessage.id)) return prev;
                  return [
                    ...prev,
                    {
                      id: newMessage.id,
                      text: decryptedText,
                      sent: newMessage.sender_id === currentUser.id,
                      time: new Date(newMessage.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                      sender_id: newMessage.sender_id,
                    },
                  ];
                });
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, selectedContact]);

  // ── Auto scroll to bottom when messages arrive ────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    if (!currentUser || !selectedContact) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedContact.id}),and(sender_id.eq.${selectedContact.id},receiver_id.eq.${currentUser.id})`
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      const decryptedMessages = await Promise.all(
        data.map(async (m) => ({
          id: m.id,
          text: await decrypt(m.payload, SHARED_KEY),
          sent: m.sender_id === currentUser.id,
          time: new Date(m.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          sender_id: m.sender_id,
        }))
      );
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

    const { error } = await supabase.from("messages").insert([newMessage]);

    if (error) {
      toast.error("Failed to send message");
    } else {
      setMessageInput("");
    }
  };

  const handleLogout = async () => {
    try {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Failed to logout");
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setMessages([]); // Clear messages from previous conversation immediately
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  return (
    <div className="h-screen flex bg-[#0f172a] overflow-hidden font-sans">

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside className={cn(
        "flex flex-col shrink-0 border-r border-white/5 bg-[#0d1526] transition-all duration-300 overflow-hidden z-40",
        showSidebar ? "w-72" : "w-0",
        "md:relative absolute inset-y-0 left-0"
      )}>
        {/* Sidebar header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shrink-0">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-sm text-white tracking-tight">
                Secure<span className="text-indigo-400">Sight</span>
              </span>
            </div>
            <button
              className="md:hidden text-slate-400 hover:text-white transition-colors p-1 rounded"
              onClick={() => setShowSidebar(false)}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full bg-white/5 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none border border-white/5 focus:border-indigo-500/40 transition-colors"
            />
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-600 text-xs">
              No contacts found.<br />
              <span className="text-slate-700">Waiting for others to join…</span>
            </div>
          ) : filteredContacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => handleSelectContact(contact)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 border-r-2",
                selectedContact?.id === contact.id
                  ? "bg-indigo-600/10 border-indigo-500"
                  : "hover:bg-white/5 border-transparent"
              )}
            >
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300 uppercase">
                  {contact.avatar}
                </div>
                {contact.online && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-[#0d1526]" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200 truncate">{contact.name}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">{contact.time}</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{contact.lastMessage}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Logout */}
        <div className="px-4 py-3 border-t border-white/5 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile sidebar dimmer */}
      {showSidebar && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ── MAIN CHAT AREA ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">

        {/* Top header */}
        <header className="h-14 flex items-center justify-between px-4 gap-2 border-b border-white/5 bg-[#0d1526]/80 backdrop-blur-sm shrink-0">
          {/* Left: hamburger + contact info */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden text-slate-400 hover:text-white transition-colors shrink-0"
              onClick={() => setShowSidebar(true)}
            >
              <Users className="w-5 h-5" />
            </button>
            {selectedContact ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300 uppercase shrink-0">
                  {selectedContact.avatar}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate leading-tight">{selectedContact.name}</h3>
                  <p className="text-[10px] text-slate-500">{selectedContact.online ? "● Online" : "Offline"}</p>
                </div>
              </div>
            ) : (
              <span className="text-sm text-slate-500">Select a contact</span>
            )}
          </div>

          {/* Right: camera dot + security badge */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live camera scanning indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
              <div className="relative flex h-2 w-2 shrink-0">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  isSecure ? "bg-green-400" : "bg-red-400"
                )}></span>
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  isSecure ? "bg-green-500" : "bg-red-500"
                )}></span>
              </div>
              <span className="text-[10px] text-slate-400 hidden sm:block">CAM</span>
            </div>
            <SecurityBadge isSecure={isSecure} />
          </div>
        </header>

        {/* Auth status bar */}
        <div className={cn(
          "px-4 py-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest border-b border-white/5 transition-colors duration-700 shrink-0",
          authState === "UNLOCKED" ? "bg-green-500/5 text-green-500" :
          authState === "VERIFYING" ? "bg-indigo-500/5 text-indigo-400" :
          "bg-red-500/5 text-red-500"
        )}>
          <div className="flex items-center gap-1.5">
            {authState === "UNLOCKED" ? (
              <><Unlock className="w-3 h-3" /> Secure View Active</>
            ) : authState === "VERIFYING" ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Verifying identity…</>
            ) : (
              <><Lock className="w-3 h-3" />
                {lockReason === "MULTIPLE_FACES" ? " Multiple faces detected — screen locked" :
                 lockReason === "NO_FACE" ? " No face detected — locked" :
                 lockReason === "IDENTITY_MISMATCH" ? " Identity mismatch — access denied" :
                 lockReason === "CAMERA_ERROR" ? " Camera error — verification failed" :
                 " Biometric verification required"}
              </>
            )}
          </div>
          {confidence !== null && (
            <div className="flex items-center gap-1 font-mono">
              <span className="text-slate-600">Match:</span>
              <span className={cn(
                "font-bold",
                confidence >= CONFIDENCE_UNLOCK_THRESHOLD + 20 ? "text-green-500" :
                confidence >= CONFIDENCE_UNLOCK_THRESHOLD ? "text-yellow-400" : "text-red-500"
              )}>{confidence}%</span>
            </div>
          )}
        </div>

        {/* Messages area (blurred/hidden when locked) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth relative" ref={scrollRef}>

          {/* Locked overlay — full blur over any messages */}
          {authState !== "UNLOCKED" && (
            <div className="absolute inset-0 z-10 backdrop-blur-xl bg-[#0f172a]/60 flex flex-col items-center justify-center gap-4 transition-all duration-500">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center border transition-all duration-300",
                lockReason === "MULTIPLE_FACES"
                  ? "bg-orange-500/10 border-orange-500/30"
                  : "bg-red-500/10 border-red-500/20"
              )}>
                {lockReason === "MULTIPLE_FACES"
                  ? <AlertTriangle className="w-7 h-7 text-orange-400" />
                  : authState === "VERIFYING"
                    ? <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
                    : <Lock className="w-7 h-7 text-red-400" />}
              </div>
              <div className="text-center px-6">
                <p className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-2">
                  {lockReason === "MULTIPLE_FACES" ? "Intruder Alert" :
                   authState === "VERIFYING" ? "Scanning…" : "Screen Locked"}
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {lockReason === "MULTIPLE_FACES"
                    ? "Another person detected in frame. Remove them to regain access."
                    : lockReason === "NO_FACE"
                      ? "No face detected. Look directly at the camera."
                      : lockReason === "IDENTITY_MISMATCH"
                        ? `Confidence too low (${confidence ?? 0}%). Move closer to your camera.`
                        : lockReason === "CAMERA_ERROR"
                          ? "Camera error. Please reload the page."
                          : "Face the camera to unlock your secure messages."}
                </p>
                {confidence !== null && authState === "VERIFYING" && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <div className="h-1 w-32 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${confidence}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{confidence}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && authState === "UNLOCKED" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Shield className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-xs text-slate-500">Vault open. Start a secure conversation.</p>
            </div>
          )}

          {/* Messages list — always rendered but blurred/hidden by overlay when locked */}
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

        {/* Message input */}
        <div className="px-4 py-3 border-t border-white/5 bg-[#0d1526]/60 shrink-0">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          >
            <input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder={isSecure ? "Type a secure message…" : "Face camera to unlock…"}
              disabled={!isSecure}
              className={cn(
                "flex-1 bg-white/5 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none border border-white/5 transition-all duration-300 min-w-0",
                isSecure ? "focus:border-indigo-500/40" : "cursor-not-allowed opacity-40"
              )}
            />
            <GlowButton
              type="submit"
              size="sm"
              className="rounded-xl shrink-0"
              disabled={!isSecure}
            >
              <Send className="w-4 h-4" />
            </GlowButton>
          </form>
        </div>
      </div>

      {/* Hidden webcam for face detection */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="fixed bottom-0 right-0 w-px h-px opacity-0 pointer-events-none"
      />

      {/* Vault loading overlay */}
      {isFaceLoading && (
        <div className="fixed inset-0 z-50 bg-[#0f172a]/97 backdrop-blur-xl flex flex-col items-center justify-center gap-4">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <Loader2 className="w-14 h-14 text-indigo-500 animate-spin absolute" />
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white mb-1">Initializing Vault</h2>
            <p className="text-sm text-slate-500">Loading secure protocols…</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
