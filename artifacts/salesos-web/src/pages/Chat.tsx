import { useState, useRef, useEffect } from "react";
import {
  useSendChat,
  useTranscribeAudio,
  useSpeakText,
  getGetDashboardSummaryQueryKey,
  getListTasksQueryKey,
  getListContactsQueryKey,
  getGetPipelineQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Volume2, VolumeX, Loader2, Sparkles, Square, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  intent?: string;
  audioUrl?: string;
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
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Hi. Talk to me like you would your assistant — log a call, add a task, move a deal. I'll handle the rest.",
    },
  ]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastObjectUrlRef = useRef<string | null>(null);
  const send = useSendChat();
  const transcribe = useTranscribeAudio();
  const speak = useSpeakText();
  const qc = useQueryClient();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
      audioRef.current?.pause();
    };
  }, []);

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

  const sendText = (text: string) => {
    if (!text.trim()) return;
    setInput("");
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", text };
    setMessages((m) => [...m, userMsg]);
    send.mutate(
      { data: { text } },
      {
        onSuccess: (resp) => {
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "assistant", text: resp.message, intent: resp.intent },
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

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        const buf = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        transcribe.mutate(
          { data: { audioBase64: b64, mimeType: actualMime } },
          {
            onSuccess: (resp) => {
              if (resp.text) setInput(resp.text);
            },
          },
        );
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
      console.error(err);
    }
  };

  const stopRecord = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const speakReply = (msg: Msg) => playTts(msg.text);

  return (
    <div className="flex flex-col h-[calc(100dvh-57px)] md:h-[100dvh]">
      <PageHeader
        title="Chat"
        subtitle="Type or speak — Claude handles intent"
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-2 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
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
                {m.text}
                {m.role === "assistant" && m.id !== "intro" && (
                  <button
                    onClick={() => speakReply(m)}
                    className="ml-2 inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors align-middle"
                    title="Play audio"
                  >
                    <Volume2 size={12} />
                  </button>
                )}
              </div>
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendText(input);
        }}
        className="border-t border-border px-3 md:px-8 py-3 flex items-end gap-2 bg-background"
      >
        <button
          type="button"
          onMouseDown={startRecord}
          onMouseUp={stopRecord}
          onMouseLeave={() => recording && stopRecord()}
          onTouchStart={startRecord}
          onTouchEnd={stopRecord}
          className={cn(
            "w-11 h-11 rounded-full grid place-items-center transition-all flex-shrink-0 relative",
            recording
              ? "bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/40"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          data-testid="button-mic"
          aria-label="Hold to record"
          aria-pressed={recording}
        >
          <Mic size={18} />
          {recording && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-rose-400 rounded-full animate-ping" />
          )}
        </button>
        <div className="flex-1 flex flex-col gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText(input);
              }
            }}
            placeholder={recording ? "Listening…" : transcribe.isPending ? "Transcribing…" : "Type or hold mic to talk…"}
            rows={1}
            className="flex-1 bg-card border border-card-border rounded-2xl px-4 py-2.5 text-[14px] outline-none focus:border-primary resize-none max-h-32"
            data-testid="input-chat"
          />
          {transcribe.isPending === false && input.trim() && (
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
          disabled={!input.trim() || send.isPending}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground grid place-items-center hover:bg-primary/90 disabled:opacity-40 transition-colors flex-shrink-0"
          data-testid="button-send"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function b64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
