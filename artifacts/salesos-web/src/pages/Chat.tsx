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
import { Send, Mic, Volume2, VolumeX, Loader2, Sparkles } from "lucide-react";
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
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("salesos.ttsEnabled") !== "false";
  });
  useEffect(() => {
    localStorage.setItem("salesos.ttsEnabled", ttsEnabled ? "true" : "false");
    if (!ttsEnabled) {
      audioRef.current?.pause();
    }
  }, [ttsEnabled]);
  const ttsEnabledRef = useRef(ttsEnabled);
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);
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

  const playTts = (text: string) => {
    if (!text.trim()) return;
    if (!ttsEnabledRef.current) return;
    speak.mutate(
      { data: { text, languageCode: "en-IN", speaker: "anushka" } },
      {
        onSuccess: (resp) => {
          if (!resp.audioBase64) return;
          if (!ttsEnabledRef.current) return;
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
            audio.play().catch((err) => {
              console.warn("TTS autoplay blocked:", err);
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
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const buf = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        transcribe.mutate(
          { data: { audioBase64: b64, mimeType: "audio/webm" } },
          {
            onSuccess: (resp) => {
              if (resp.text) sendText(resp.text);
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
            "w-11 h-11 rounded-full grid place-items-center transition-all flex-shrink-0",
            recording
              ? "bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/40"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
          data-testid="button-mic"
          aria-label="Hold to record"
        >
          <Mic size={18} />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText(input);
            }
          }}
          placeholder={recording ? "Listening…" : "Type or hold mic to talk…"}
          rows={1}
          className="flex-1 bg-card border border-card-border rounded-2xl px-4 py-2.5 text-[14px] outline-none focus:border-primary resize-none max-h-32"
          data-testid="input-chat"
        />
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
