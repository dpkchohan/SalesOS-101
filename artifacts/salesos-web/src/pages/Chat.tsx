import { useState, useRef, useEffect, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { getApiUrl } from "@/lib/api";
import {
  useSendChat,
  useTranscribeAudio,
  useSpeakText,
  useUploadChatAttachment,
  useExtractChatAttachment,
  useApplyChatAttachment,
  getChatAttachment as fetchChatAttachment,
  getGetDashboardSummaryQueryKey,
  getListTasksQueryKey,
  getListContactsQueryKey,
  getGetPipelineQueryKey,
  type ChatAttachment,
  type ExtractedAttachmentContact,
  type ExtractedAttachmentLead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Mic,
  Volume2,
  VolumeX,
  Loader2,
  Sparkles,
  Square,
  Settings2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X,
  CheckCircle2,
  UserPlus,
  Briefcase,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { cn } from "@/lib/utils";

interface DuplicateContactInfo {
  id: string;
  name: string;
  customerNo?: string | null;
  email?: string | null;
  matchedField: string;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
  intent?: string;
  audioUrl?: string;
  attachment?: ChatAttachment;
  appliedNote?: string;
  duplicate?: DuplicateContactInfo;
  documentId?: string | null;
}

const SUGGESTIONS = [
  "Add new contact Sarah Lee, sarah@globex.com, VP Eng at Globex",
  "Remind me to follow up with Acme tomorrow",
  "Logged a call with Acme — they want pricing by Friday",
  "Move Initech to qualified",
];

const TTS_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "हिन्दी Hindi" },
  { code: "ta-IN", label: "தமிழ் Tamil" },
  { code: "te-IN", label: "తెలుగు Telugu" },
  { code: "kn-IN", label: "ಕನ್ನಡ Kannada" },
  { code: "ml-IN", label: "മലയാളം Malayalam" },
  { code: "mr-IN", label: "मराठी Marathi" },
  { code: "bn-IN", label: "বাংলা Bengali" },
  { code: "gu-IN", label: "ગુજરાતી Gujarati" },
  { code: "od-IN", label: "ଓଡ଼ିଆ Odia" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ Punjabi" },
];

const TTS_SPEAKERS: { id: string; label: string; gender: "F" | "M" }[] = [
  { id: "anushka", label: "Anushka", gender: "F" },
  { id: "manisha", label: "Manisha", gender: "F" },
  { id: "vidya", label: "Vidya", gender: "F" },
  { id: "arya", label: "Arya", gender: "F" },
  { id: "abhilash", label: "Abhilash", gender: "M" },
  { id: "karun", label: "Karun", gender: "M" },
  { id: "hitesh", label: "Hitesh", gender: "M" },
];

const DEFAULT_TTS_LANG = "en-IN";
const DEFAULT_TTS_SPEAKER = "anushka";

export default function Chat() {
  // Read contactId from URL query params (e.g. /chat?contactId=xxx&contactName=yyy)
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : "",
  );
  const urlContactId = searchParams.get("contactId") ?? null;
  const urlContactName = searchParams.get("contactName") ?? null;
  const urlSessionId = searchParams.get("sessionId") ?? null;
  // General chat = no contact/session URL params — eligible for sessionStorage persistence
  const isGeneralChat = !urlContactId && !urlSessionId;

  const { getToken } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(urlSessionId);
  const [sessionLoading, setSessionLoading] = useState(!!urlSessionId);
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (urlSessionId) return [];
    if (isGeneralChat) {
      try {
        const stored = sessionStorage.getItem("salesos.chat.messages");
        if (stored) {
          const parsed = JSON.parse(stored) as Msg[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [
      {
        id: "intro",
        role: "assistant" as const,
        text: urlContactName
          ? `Hi. I'm ready to help you with ${urlContactName}. Log a call, add a task, move a deal — just tell me.`
          : "Hi. Talk to me like you would your assistant — log a call, add a task, move a deal. I'll handle the rest.",
      },
    ];
  });
  const [input, setInput] = useState(() => {
    if (!isGeneralChat) return "";
    try { return sessionStorage.getItem("salesos.chat.input") ?? ""; } catch { return ""; }
  });
  // Track whether a saved scroll position exists for restoration on mount
  const [hasSavedScroll] = useState<boolean>(() => {
    if (!isGeneralChat) return false;
    try { return sessionStorage.getItem("salesos.chat.scrollTop") !== null; } catch { return false; }
  });
  const scrollHandledRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("salesos.ttsEnabled") !== "false";
  });
  const [ttsLang, setTtsLang] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_TTS_LANG;
    const saved = localStorage.getItem("salesos.ttsLang");
    return TTS_LANGUAGES.some((l) => l.code === saved) ? saved! : DEFAULT_TTS_LANG;
  });
  const [ttsSpeaker, setTtsSpeaker] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_TTS_SPEAKER;
    const saved = localStorage.getItem("salesos.ttsSpeaker");
    return TTS_SPEAKERS.some((s) => s.id === saved) ? saved! : DEFAULT_TTS_SPEAKER;
  });
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const voiceMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    localStorage.setItem("salesos.ttsEnabled", ttsEnabled ? "true" : "false");
    if (!ttsEnabled) {
      audioRef.current?.pause();
      setTtsPlaying(false);
    }
  }, [ttsEnabled]);
  useEffect(() => {
    localStorage.setItem("salesos.ttsLang", ttsLang);
  }, [ttsLang]);
  useEffect(() => {
    localStorage.setItem("salesos.ttsSpeaker", ttsSpeaker);
  }, [ttsSpeaker]);
  const ttsEnabledRef = useRef(ttsEnabled);
  const ttsLangRef = useRef(ttsLang);
  const ttsSpeakerRef = useRef(ttsSpeaker);
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);
  useEffect(() => {
    ttsLangRef.current = ttsLang;
  }, [ttsLang]);
  useEffect(() => {
    ttsSpeakerRef.current = ttsSpeaker;
  }, [ttsSpeaker]);
  useEffect(() => {
    if (!voiceMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target as Node)) {
        setVoiceMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVoiceMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [voiceMenuOpen]);
  // Bug 2: Load existing session transcript when sessionId is in URL
  useEffect(() => {
    if (!urlSessionId) return;
    setSessionLoading(true);
    getToken()
      .then((token) =>
        fetch(getApiUrl(`/api/chat-sessions/${urlSessionId}/messages`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      )
      .then((r) => r.json())
      .then((data: { messages?: Array<{ id: string; role: string; content: string; createdAt: string }> }) => {
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              text: m.content,
              timestamp: m.createdAt,
            })),
          );
        } else {
          // Session exists but has no messages — keep empty so the user
          // can continue typing (the sessionId state is already set above).
          setMessages([]);
        }
      })
      .catch((err) => {
        console.warn("Failed to load session transcript:", err);
        setMessages([{ id: "intro", role: "assistant", text: "Couldn't load previous messages." }]);
      })
      .finally(() => setSessionLoading(false));
  }, [urlSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const recorderRef = useRef<MediaRecorder | null>(null);
  const pendingStopRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastObjectUrlRef = useRef<string | null>(null);
  const send = useSendChat();
  const transcribe = useTranscribeAudio();
  const speak = useSpeakText();
  const upload = useUploadChatAttachment();
  const extract = useExtractChatAttachment();
  const apply = useApplyChatAttachment();
  const qc = useQueryClient();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragCount = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);

  const ACCEPTED = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain";
  const MAX_BYTES = 10 * 1024 * 1024;

  // Restore scroll position BEFORE browser paint (synchronous, runs after DOM update)
  useLayoutEffect(() => {
    if (!isGeneralChat) return;
    try {
      const s = sessionStorage.getItem("salesos.chat.scrollTop");
      if (s && scrollRef.current) {
        const top = parseInt(s, 10);
        if (!isNaN(top)) scrollRef.current.scrollTop = top;
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // On first run after mount: skip auto-scroll-to-bottom if we restored from sessionStorage
    if (!scrollHandledRef.current) {
      scrollHandledRef.current = true;
      if (!hasSavedScroll) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
      audioRef.current?.pause();
      // Save scroll position so it can be restored when navigating back to chat
      if (isGeneralChat && scrollRef.current) {
        try {
          sessionStorage.setItem("salesos.chat.scrollTop", String(scrollRef.current.scrollTop));
        } catch {}
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist messages across page navigation (general chat only; skip contact/session URLs)
  useEffect(() => {
    if (!isGeneralChat) return;
    try {
      if (messages.length <= 1 && messages[0]?.id === "intro") {
        sessionStorage.removeItem("salesos.chat.messages");
      } else {
        // Strip audioUrl — blob URLs are ephemeral and won't work after restore
        const toSave = messages.map(({ audioUrl: _au, ...m }) => m);
        sessionStorage.setItem("salesos.chat.messages", JSON.stringify(toSave));
      }
    } catch {}
  }, [messages, isGeneralChat]);

  // Persist input draft across page navigation (general chat only)
  useEffect(() => {
    if (!isGeneralChat) return;
    try {
      if (input) {
        sessionStorage.setItem("salesos.chat.input", input);
      } else {
        sessionStorage.removeItem("salesos.chat.input");
      }
    } catch {}
  }, [input, isGeneralChat]);

  const playTts = (text: string, opts?: { force?: boolean }) => {
    if (!text.trim()) return;
    if (!opts?.force && !ttsEnabledRef.current) return;
    speak.mutate(
      { data: { text, languageCode: ttsLangRef.current, speaker: ttsSpeakerRef.current } },
      {
        onSuccess: (resp) => {
          if (!resp.audioBase64) return;
          if (!opts?.force && !ttsEnabledRef.current) return;
          try {
            const blob = b64ToBlob(resp.audioBase64, resp.mimeType ?? "audio/wav");
            const url = URL.createObjectURL(blob);
            if (audioRef.current) {
              audioRef.current.pause();
            }
            if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
            lastObjectUrlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => setTtsPlaying(false);
            audio.onpause = () => setTtsPlaying(false);
            audio.onplay = () => setTtsPlaying(true);
            audio.play().catch((err) => {
              console.warn("TTS autoplay blocked:", err);
              setTtsPlaying(false);
            });
          } catch (err) {
            console.warn("TTS playback failed:", err);
          }
        },
        onError: (err) => {
          console.warn("TTS request failed:", err);
        },
      },
    );
  };

  // Poll attachments until extraction completes or fails
  useEffect(() => {
    if (pollingIds.size === 0) return;
    let cancelled = false;
    const tick = async () => {
      for (const id of Array.from(pollingIds)) {
        try {
          const fresh = await fetchChatAttachment(id);
          if (cancelled) return;
          setMessages((curr) =>
            curr.map((m) => (m.attachment?.id === id ? { ...m, attachment: fresh } : m)),
          );
          if (fresh.extractionStatus === "done" || fresh.extractionStatus === "failed") {
            setPollingIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch {
          /* keep polling */
        }
      }
    };
    void tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollingIds]);

  const pickFile = (f: File) => {
    setUploadError(null);
    if (f.size > MAX_BYTES) {
      setUploadError("File too large. Max 10 MB.");
      return;
    }
    setPendingFile(f);
  };

  const sendAttachment = async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    setUploadError(null);
    const userMsgId = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: userMsgId, role: "user", text: `📎 ${file.name}` },
    ]);
    try {
      const att = await upload.mutateAsync({ data: { file } });
      const assistantId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: "assistant",
          text: "",
          attachment: att,
        },
      ]);
      setPollingIds((prev) => new Set(prev).add(att.id));
      // Kick extraction (non-blocking)
      extract.mutate({ id: att.id });
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed.",
        },
      ]);
    }
  };

  const applyExtraction = async (
    msgId: string,
    attachmentId: string,
    action: "contact" | "lead",
    contactIndex: number | null,
    overrides?: Record<string, unknown>,
  ) => {
    try {
      const result = await apply.mutateAsync({
        id: attachmentId,
        data: {
          action,
          ...(contactIndex != null ? { contactIndex } : {}),
          ...(overrides ? { overrides } : {}),
        },
      });
      let note: string;
      if (contactIndex == null && result.results.length > 1) {
        const added = result.results.filter((r) => !r.merged).length;
        const merged = result.results.filter((r) => r.merged).length;
        const leads = result.results.filter((r) => r.leadId).length;
        const parts: string[] = [];
        if (added) parts.push(`Added ${added}`);
        if (merged) parts.push(`merged ${merged}`);
        const head = parts.length ? parts.join(", ") : `Processed ${result.results.length}`;
        const tail =
          action === "lead" && leads
            ? ` · ${leads} lead${leads === 1 ? "" : "s"}`
            : "";
        note = `${head} contact${result.results.length === 1 ? "" : "s"}${tail}`;
      } else {
        note = result.results
          .map((r) =>
            action === "lead"
              ? `${r.merged ? "Merged" : "Added"} ${r.contactName}${r.leadId ? " + lead" : ""}`
              : `${r.merged ? "Merged" : "Added"} ${r.contactName}`,
          )
          .join(" · ");
      }
      setMessages((curr) =>
        curr.map((m) => (m.id === msgId ? { ...m, appliedNote: note } : m)),
      );
      qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    } catch (err) {
      setMessages((curr) =>
        curr.map((m) =>
          m.id === msgId
            ? {
                ...m,
                appliedNote:
                  err instanceof Error ? `Failed: ${err.message}` : "Could not apply.",
              }
            : m,
        ),
      );
    }
  };

  const sendText = (text: string) => {
    if (!text.trim()) {
      if (pendingFile) void sendAttachment();
      return;
    }
    setInput("");
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
    setMessages((m) => [...m, userMsg]);

    // Bug 1: Explicitly create a session before the first message
    const doSend = async () => {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        try {
          const token = await getToken();
          const resp = await fetch(getApiUrl("/api/chat/sessions"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ contactId: urlContactId }),
          });
          const data = (await resp.json()) as { sessionId?: string };
          if (data.sessionId) {
            currentSessionId = data.sessionId;
            setSessionId(currentSessionId);
          }
        } catch (err) {
          console.warn("Failed to pre-create chat session:", err);
        }
      }

      send.mutate(
        { data: { text, contactId: urlContactId, sessionId: currentSessionId } },
        {
          onSuccess: (resp) => {
            if (resp.sessionId && !currentSessionId) setSessionId(resp.sessionId);
          const dup = resp.duplicateDetected && resp.duplicateContact
            ? {
                id: resp.duplicateContact.id,
                name: resp.duplicateContact.name,
                customerNo: resp.duplicateContact.customerNo ?? null,
                email: resp.duplicateContact.email ?? null,
                matchedField: resp.duplicateMatchedField ?? "match",
              }
            : undefined;
          const documentId =
            resp && typeof resp === "object" && "documentId" in resp
              ? ((resp as { documentId?: string | null }).documentId ?? null)
              : null;
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: resp.message,
              intent: resp.intent,
              duplicate: dup,
              documentId,
            },
          ]);
          // Speak the assistant's reply via Sarvam TTS (silent fallback on failure).
          playTts(resp.message);
          // Invalidate everything that may have changed
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getListTasksQueryKey() });
          qc.invalidateQueries({ queryKey: getListContactsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetPipelineQueryKey() });
        },
        onError: () => {
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "assistant", text: "Sorry, that failed. Try again." },
          ]);
        },
      },
    );
    };
    void doSend();
  };

  const startRecord = async () => {
    setMicError(null);
    pendingStopRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Voice not supported in this browser");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setMicError("Voice not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // If stop was requested while awaiting permission (fast tap), abort cleanly
      if (pendingStopRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        pendingStopRef.current = false;
        return;
      }
      const preferredTypes = ["audio/webm", "audio/mp4", "audio/ogg"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const actualMime = mr.mimeType || mimeType || "audio/webm";
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size === 0) {
          setMicError("Recording too short — please try again");
          return;
        }
        const buf = await blob.arrayBuffer();
        // Loop-based btoa avoids call-stack overflow for large audio buffers
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        transcribe.mutate(
          { data: { audioBase64: b64, mimeType: actualMime, languageCode: ttsLang } },
          {
            onSuccess: (resp) => {
              if (resp.text) setInput(resp.text);
            },
            onError: () => {
              setMicError("Transcription failed — check your connection");
            },
          },
        );
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err: unknown) {
      const name = (err as { name?: string }).name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError("Microphone permission required — allow access in browser settings");
      } else if (name === "NotFoundError") {
        setMicError("No microphone found on this device");
      } else {
        setMicError("Microphone unavailable");
      }
      console.error(err);
    }
  };

  const stopRecord = () => {
    if (!recorderRef.current) {
      // startRecord hasn't finished yet — flag it to abort immediately on init
      pendingStopRef.current = true;
      setRecording(false);
      return;
    }
    try { recorderRef.current.stop(); } catch { /* already stopped */ }
    recorderRef.current = null;
    setRecording(false);
  };

  const handleMicClick = () => {
    setMicError(null);
    if (recording) {
      stopRecord();
    } else {
      void startRecord();
    }
  };

  const speakReply = (msg: Msg) => playTts(msg.text);

  return (
    <div
      className={cn(
        "flex flex-col h-[calc(100dvh-57px)] md:h-full relative",
        dragOver && "ring-2 ring-primary ring-inset",
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCount.current++;
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCount.current--;
        if (dragCount.current <= 0) setDragOver(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragCount.current = 0;
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) pickFile(f);
      }}
    >
      <PageHeader
        title="Chat"
        subtitle={
          urlContactName ? (
            <span className="flex items-center gap-2 flex-wrap">
              <span>Chatting about {urlContactName}</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                💾 Saving to {urlContactName}
              </span>
            </span>
          ) : (
            "Type or speak — Claude handles intent"
          )
        }
        right={
          <div ref={voiceMenuRef} className="flex items-center gap-1.5 relative">
            <button
              type="button"
              onClick={() => setVoiceMenuOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-card-border transition-colors hover:bg-muted text-foreground",
                voiceMenuOpen && "bg-muted",
              )}
              data-testid="button-voice-settings"
              title="Voice language & speaker"
              aria-expanded={voiceMenuOpen}
            >
              <Settings2 size={13} />
              <span className="hidden sm:inline">
                {TTS_LANGUAGES.find((l) => l.code === ttsLang)?.label.split(" ")[0] ?? ttsLang}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTtsEnabled((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-card-border transition-colors",
                ttsEnabled
                  ? "hover:bg-muted text-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
              data-testid="button-tts-toggle"
              title={ttsEnabled ? "Mute agent voice" : "Unmute agent voice"}
              aria-pressed={!ttsEnabled}
            >
              {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {ttsEnabled ? "Mute" : "Muted"}
            </button>
            {voiceMenuOpen && (
              <>
                <div
                  className="absolute right-0 top-full mt-2 w-72 z-50 rounded-xl border border-card-border bg-card shadow-xl p-3 space-y-3"
                  data-testid="panel-voice-settings"
                >
                  <div>
                    <label
                      htmlFor="tts-language-select"
                      className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1"
                    >
                      Language
                    </label>
                    <select
                      id="tts-language-select"
                      value={ttsLang}
                      onChange={(e) => setTtsLang(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                      data-testid="select-tts-language"
                    >
                      {TTS_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="tts-speaker-select"
                      className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1"
                    >
                      Speaker
                    </label>
                    <select
                      id="tts-speaker-select"
                      value={ttsSpeaker}
                      onChange={(e) => setTtsSpeaker(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                      data-testid="select-tts-speaker"
                    >
                      {TTS_SPEAKERS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} ({s.gender === "F" ? "Female" : "Male"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const greet =
                        ttsLang === "en-IN"
                          ? "Hi, this is your sales assistant."
                          : ttsLang === "hi-IN"
                            ? "नमस्ते, मैं आपका सेल्स असिस्टेंट हूँ।"
                            : "Namaste.";
                      playTts(greet, { force: true });
                    }}
                    className="w-full text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    disabled={speak.isPending}
                    data-testid="button-tts-preview"
                  >
                    {speak.isPending ? "Loading…" : "Preview voice"}
                  </button>
                </div>
              </>
            )}
          </div>
        }
      />
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-2 space-y-3 pb-36 md:pb-2">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.attachment ? (
                <AttachmentCard
                  msgId={m.id}
                  attachment={m.attachment}
                  appliedNote={m.appliedNote}
                  applying={apply.isPending}
                  onApply={(action, idx, overrides) =>
                    applyExtraction(m.id, m.attachment!.id, action, idx, overrides)
                  }
                  onApplyAll={() =>
                    applyExtraction(m.id, m.attachment!.id, "contact", null)
                  }
                />
              ) : (
                <div
                  className={cn(
                    "max-w-[88%] md:max-w-[65%] px-4 py-2.5 rounded-2xl text-[14px] leading-snug",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-card-border rounded-bl-md",
                  )}
                  data-testid={`msg-${m.role}`}
                >
                  {m.role === "assistant" && m.intent && m.intent !== "general" && (
                    <div className="text-[10px] uppercase tracking-wider font-bold text-primary flex items-center gap-1 mb-1">
                      <Sparkles size={10} /> {m.intent.replace(/_/g, " ")}
                    </div>
                  )}
                  {m.role === "user" ? (
                    m.text
                  ) : (
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) =>
                          href?.startsWith("/") ? (
                            <Link
                              to={href}
                              className="text-primary underline hover:opacity-80 font-semibold"
                            >
                              {children}
                            </Link>
                          ) : (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary underline hover:opacity-80"
                            >
                              {children}
                            </a>
                          ),
                        p: ({ children }) => <span>{children}</span>,
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>
                  )}
                  {m.role === "assistant" && m.duplicate && (
                    <div
                      className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[12px]"
                      data-testid="chat-duplicate-card"
                    >
                      <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-amber-700 dark:text-amber-400">
                          Possible duplicate ({m.duplicate.matchedField})
                        </div>
                        <div className="text-muted-foreground truncate">
                          {m.duplicate.name}
                          {m.duplicate.customerNo && (
                            <span className="ml-1 font-mono text-[10px] px-1 py-0.5 rounded bg-muted">
                              {m.duplicate.customerNo}
                            </span>
                          )}
                          {m.duplicate.email && <span className="ml-1">· {m.duplicate.email}</span>}
                        </div>
                        <Link
                          href={`/contacts/${m.duplicate.id}`}
                          className="inline-block mt-1 text-primary hover:underline"
                          data-testid="chat-duplicate-open"
                        >
                          Open existing contact →
                        </Link>
                      </div>
                    </div>
                  )}
                  {m.role === "assistant" && m.documentId && (
                    <div
                      className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30 text-[12px]"
                      data-testid="chat-proposal-card"
                    >
                      <Sparkles size={13} className="text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-primary">Proposal drafted</div>
                        <Link
                          href={`/documents/${m.documentId}`}
                          className="inline-block mt-1 text-primary hover:underline"
                          data-testid="chat-proposal-open"
                        >
                          Open document →
                        </Link>
                      </div>
                    </div>
                  )}
                  {m.role === "assistant" && m.id !== "intro" && m.text && (
                    <button
                      onClick={() => speakReply(m)}
                      className="ml-2 inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors align-middle"
                      title="Play audio"
                    >
                      <Volume2 size={12} />
                    </button>
                  )}
                  {m.timestamp && (
                    <div
                      className={cn(
                        "text-[10px] mt-1 opacity-60",
                        m.role === "user" ? "text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {new Date(m.timestamp).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {ttsPlaying && (
          <div className="flex items-center gap-2 text-[12px] text-primary" data-testid="tts-playing-indicator">
            <Volume2 size={13} className="animate-pulse" />
            <span>Playing…</span>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setTtsPlaying(false);
              }}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-tts-stop"
              aria-label="Stop audio"
            >
              <Square size={11} className="fill-current" /> Stop
            </button>
          </div>
        )}
        {sessionLoading && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            Loading conversation…
          </div>
        )}
        {(send.isPending || transcribe.isPending) && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            {transcribe.isPending ? "transcribing…" : "thinking…"}
          </div>
        )}
        {messages.length <= 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => sendText(s)}
                className="text-left p-3 rounded-xl bg-card border border-card-border hover:border-primary/50 transition-colors text-[12.5px] text-muted-foreground"
                data-testid="suggestion"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {dragOver && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-primary/10 backdrop-blur-sm pointer-events-none">
          <div className="text-[15px] font-bold text-primary flex items-center gap-2">
            <Paperclip size={16} /> Drop file to attach (max 10 MB)
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pendingFile && !input.trim()) {
            void sendAttachment();
          } else {
            sendText(input);
          }
        }}
        className="fixed chat-input-bar-mobile left-0 right-0 z-20 border-t border-border px-3 md:px-8 py-3 flex flex-col gap-2 bg-background md:sticky md:bottom-0 md:left-auto md:right-auto md:z-10"
      >
        {(pendingFile || uploadError) && (
          <div className="flex items-center gap-2 flex-wrap">
            {pendingFile && (
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-[12px] font-semibold text-primary"
                data-testid="chip-pending-file"
              >
                {pendingFile.type.startsWith("image/") ? (
                  <ImageIcon size={12} />
                ) : (
                  <FileText size={12} />
                )}
                <span className="max-w-[200px] truncate">{pendingFile.name}</span>
                <span className="text-[10px] text-primary/70 tabular-nums">
                  {(pendingFile.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="hover:text-rose-400 transition-colors"
                  aria-label="Remove file"
                  data-testid="button-remove-pending-file"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {uploadError && (
              <div className="text-[12px] text-rose-400 flex items-center gap-1">
                <AlertTriangle size={12} /> {uploadError}
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-11 h-11 rounded-full grid place-items-center bg-muted text-muted-foreground hover:bg-muted/80 transition-all flex-shrink-0"
          data-testid="button-attach"
          aria-label="Attach file"
          title="Attach business card or document (max 10 MB)"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
          data-testid="input-attach"
        />
        <button
          type="button"
          onClick={handleMicClick}
          className={cn(
            "w-11 h-11 rounded-full grid place-items-center transition-all flex-shrink-0 relative",
            recording
              ? "bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/40"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          data-testid="button-mic"
          aria-label={recording ? "Tap to stop recording" : "Tap to record"}
          aria-pressed={recording}
        >
          <Mic size={18} />
          {recording && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-400 rounded-full animate-ping" />
          )}
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          {micError && (
            <div className="text-[11px] text-rose-500 px-1 flex items-center gap-1">
              <span>⚠</span> {micError}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText(input);
              }
            }}
            placeholder={recording ? "Listening… tap mic to stop" : transcribe.isPending ? "Transcribing…" : "Type or tap mic to record…"}
            rows={1}
            className="flex-1 bg-card border border-card-border rounded-2xl px-4 py-2.5 text-[14px] outline-none focus:border-primary resize-none max-h-32"
            data-testid="input-chat"
          />
          {!transcribe.isPending && input.trim() && (
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[11px] text-muted-foreground">Edit above or</span>
              <button
                type="button"
                onClick={() => sendText(input)}
                className="text-[11px] font-semibold text-primary hover:underline"
                data-testid="button-confirm-send"
              >
                tap to send →
              </button>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={(!input.trim() && !pendingFile) || send.isPending || upload.isPending}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground grid place-items-center hover:bg-primary/90 disabled:opacity-40 transition-colors flex-shrink-0"
          data-testid="button-send"
        >
          {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
        </div>
      </form>
    </div>
  );
}

interface ContactDraft {
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  notes: string;
  stage: string;
  valueUsd: string;
  closeDate: string;
}

function buildDraft(
  c: ExtractedAttachmentContact,
  lead: ExtractedAttachmentLead | undefined,
): ContactDraft {
  return {
    name: c.name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    title: c.title ?? "",
    company: c.company ?? "",
    notes: c.notes ?? "",
    stage: lead?.stage ?? "",
    valueUsd: lead?.valueUsd != null ? String(lead.valueUsd) : "",
    closeDate: lead?.closeDate ?? "",
  };
}

function diffOverrides(
  draft: ContactDraft,
  c: ExtractedAttachmentContact,
  lead: ExtractedAttachmentLead | undefined,
  action: "contact" | "lead",
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  const set = (k: string, v: string, original: string | null | undefined) => {
    const trimmed = v.trim();
    const orig = (original ?? "").toString();
    if (trimmed !== orig.trim()) overrides[k] = trimmed === "" ? null : trimmed;
  };
  set("name", draft.name, c.name);
  set("email", draft.email, c.email);
  set("phone", draft.phone, c.phone);
  set("title", draft.title, c.title);
  set("company", draft.company, c.company);
  set("notes", draft.notes, c.notes);
  if (action === "lead") {
    set("stage", draft.stage, lead?.stage);
    set("closeDate", draft.closeDate, lead?.closeDate);
    const draftVal = draft.valueUsd.trim();
    const origVal = lead?.valueUsd != null ? String(lead.valueUsd) : "";
    if (draftVal !== origVal) {
      if (draftVal === "") {
        overrides.valueUsd = null;
      } else {
        const n = Number(draftVal.replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(n)) overrides.valueUsd = Math.round(n);
      }
    }
  }
  return overrides;
}

function AttachmentCard({
  msgId,
  attachment,
  appliedNote,
  applying,
  onApply,
  onApplyAll,
}: {
  msgId: string;
  attachment: ChatAttachment;
  appliedNote?: string;
  applying: boolean;
  onApply: (
    action: "contact" | "lead",
    contactIndex: number,
    overrides?: Record<string, unknown>,
  ) => void;
  onApplyAll: () => void;
}) {
  const status = attachment.extractionStatus;
  const data = attachment.extractedData;
  const isImage = attachment.fileType === "image";
  const Icon = isImage ? ImageIcon : FileText;
  const lowConfidence = !!data && data.confidence < 0.6;
  const [editing, setEditing] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<Record<number, ContactDraft>>({});

  useEffect(() => {
    if (status !== "done" || !data) return;
    setDrafts((prev) => {
      const next = { ...prev };
      data.contacts.forEach((c, i) => {
        if (!next[i]) next[i] = buildDraft(c, data.leads[i]);
      });
      return next;
    });
    if (lowConfidence) {
      setEditing((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const next: Record<number, boolean> = {};
        data.contacts.forEach((_, i) => {
          next[i] = true;
        });
        return next;
      });
    }
  }, [status, data, lowConfidence]);

  const updateDraft = (idx: number, patch: Partial<ContactDraft>) => {
    setDrafts((prev) => ({ ...prev, [idx]: { ...prev[idx], ...patch } }));
  };

  return (
    <div
      className="max-w-[88%] md:max-w-[70%] rounded-2xl bg-card border border-card-border rounded-bl-md overflow-hidden"
      data-testid={`attachment-card-${msgId}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-card-border bg-muted/20">
        <Icon size={14} className="text-primary flex-shrink-0" />
        <span className="text-[12.5px] font-semibold truncate">{attachment.fileName}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
          {(attachment.fileSize / 1024).toFixed(0)} KB
        </span>
      </div>

      {(status === "pending" || status === "running") && (
        <div className="px-4 py-4 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span>Reading {isImage ? "card" : "document"} with AI…</span>
        </div>
      )}

      {status === "failed" && (
        <div className="px-4 py-4 text-[13px] text-rose-300 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <div>{attachment.error ?? "Extraction failed."}</div>
        </div>
      )}

      {status === "done" && data && (
        <div className="px-4 py-3 space-y-3">
          {data.summary && (
            <div className="text-[13px] text-foreground leading-snug">{data.summary}</div>
          )}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <Sparkles size={11} className="text-primary" />
            <span className="text-primary">{data.kind}</span>
            <span>· confidence {Math.round(data.confidence * 100)}%</span>
          </div>

          {data.contacts.length === 0 && (
            <div className="text-[12px] text-muted-foreground italic">
              No contacts detected in this {isImage ? "image" : "file"}.
            </div>
          )}

          {data.contacts.length >= 2 && (
            <button
              type="button"
              onClick={onApplyAll}
              disabled={applying || !!appliedNote}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              data-testid="button-add-all-contacts"
            >
              <UserPlus size={13} /> Add all {data.contacts.length} to Contacts
            </button>
          )}

          {data.contacts.map((c: ExtractedAttachmentContact, i: number) => {
            const lead = data.leads[i] as ExtractedAttachmentLead | undefined;
            const isEditing = !!editing[i];
            const draft = drafts[i] ?? buildDraft(c, lead);
            const handleApply = (action: "contact" | "lead") => {
              const overrides = isEditing
                ? diffOverrides(draft, c, lead, action)
                : {};
              onApply(
                action,
                i,
                Object.keys(overrides).length ? overrides : undefined,
              );
            };
            return (
              <div
                key={i}
                className="rounded-lg border border-card-border bg-muted/20 px-3 py-2.5 space-y-1"
                data-testid={`extracted-contact-${i}`}
              >
                {!isEditing && (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[14px] font-bold">{c.name || "Unnamed"}</div>
                      <button
                        type="button"
                        onClick={() => setEditing((p) => ({ ...p, [i]: true }))}
                        disabled={!!appliedNote}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                        data-testid={`button-edit-contact-${i}`}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                    </div>
                    {(c.title || c.company) && (
                      <div className="text-[12px] text-muted-foreground">
                        {[c.title, c.company].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    <div className="text-[12px] text-muted-foreground space-y-0.5">
                      {c.email && <div>{c.email}</div>}
                      {c.phone && <div>{c.phone}</div>}
                    </div>
                    {lead && (lead.stage || lead.valueUsd != null) && (
                      <div className="text-[11px] text-primary/80 font-medium">
                        Lead: {lead.stage ?? "new"}
                        {lead.valueUsd != null ? ` · $${lead.valueUsd.toLocaleString()}` : ""}
                      </div>
                    )}
                  </>
                )}

                {isEditing && (
                  <div className="space-y-2 pt-0.5" data-testid={`editor-contact-${i}`}>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        Edit before saving
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          updateDraft(i, buildDraft(c, lead));
                          setEditing((p) => ({ ...p, [i]: false }));
                        }}
                        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`button-cancel-edit-${i}`}
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <DraftField
                        label="Name"
                        value={draft.name}
                        onChange={(v) => updateDraft(i, { name: v })}
                        testId={`edit-name-${i}`}
                      />
                      <DraftField
                        label="Email"
                        type="email"
                        value={draft.email}
                        onChange={(v) => updateDraft(i, { email: v })}
                        testId={`edit-email-${i}`}
                      />
                      <DraftField
                        label="Phone"
                        value={draft.phone}
                        onChange={(v) => updateDraft(i, { phone: v })}
                        testId={`edit-phone-${i}`}
                      />
                      <DraftField
                        label="Title"
                        value={draft.title}
                        onChange={(v) => updateDraft(i, { title: v })}
                        testId={`edit-title-${i}`}
                      />
                      <DraftField
                        label="Company"
                        value={draft.company}
                        onChange={(v) => updateDraft(i, { company: v })}
                        testId={`edit-company-${i}`}
                      />
                    </div>
                    <DraftField
                      label="Notes"
                      value={draft.notes}
                      onChange={(v) => updateDraft(i, { notes: v })}
                      multiline
                      testId={`edit-notes-${i}`}
                    />
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-card-border/60">
                      <DraftField
                        label="Stage"
                        value={draft.stage}
                        onChange={(v) => updateDraft(i, { stage: v })}
                        placeholder="new"
                        testId={`edit-stage-${i}`}
                      />
                      <DraftField
                        label="Value (USD)"
                        value={draft.valueUsd}
                        onChange={(v) => updateDraft(i, { valueUsd: v })}
                        placeholder="0"
                        testId={`edit-value-${i}`}
                      />
                      <DraftField
                        label="Close Date"
                        type="date"
                        value={draft.closeDate}
                        onChange={(v) => updateDraft(i, { closeDate: v })}
                        testId={`edit-close-${i}`}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Stage / Value / Close Date apply only when saving as a Lead.
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => handleApply("contact")}
                    disabled={applying || !!appliedNote}
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    data-testid={`button-add-contact-${i}`}
                  >
                    <UserPlus size={12} /> Add to Contacts
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApply("lead")}
                    disabled={applying || !!appliedNote}
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                    data-testid={`button-add-lead-${i}`}
                  >
                    <Briefcase size={12} /> Add as Lead
                  </button>
                </div>
              </div>
            );
          })}

          {appliedNote && (
            <div className="flex items-center gap-1.5 text-[12px] text-emerald-400" data-testid="applied-note">
              <CheckCircle2 size={13} />
              <span>{appliedNote}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraftField({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const cls =
    "w-full bg-background border border-card-border rounded-md px-2 py-1 text-[12.5px] outline-none focus:border-primary";
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(cls, "resize-none")}
          data-testid={testId}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
          data-testid={testId}
        />
      )}
    </label>
  );
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
