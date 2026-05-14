"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { parentApi, type ChatMessage, type ChatReply } from "@/lib/parent-api";
import { ArrowLeft, Send, Loader2, Heart, Volume2, Square, ChevronDown } from "lucide-react";

// ── Get audio duration from base64 ──
function getAudioDuration(base64: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:audio/mp3;base64,${base64}`);
    audio.addEventListener("loadedmetadata", () => {
      resolve(Math.round(audio.duration));
    });
    audio.addEventListener("error", () => resolve(0));
    // Some browsers need this to trigger metadata load
    audio.preload = "metadata";
  });
}

// ── Voice bubble width based on duration (WeChat style) ──
function getVoiceBubbleWidth(seconds: number): string {
  if (seconds <= 0) return "120px";
  if (seconds <= 2) return "120px";
  if (seconds <= 5) return "160px";
  if (seconds <= 10) return "200px";
  if (seconds <= 20) return "240px";
  if (seconds <= 40) return "280px";
  return "300px";
}

// ── Voice bar wave animation (3 bars) ──
function VoiceWaves({ active, count = 4 }: { active: boolean; count?: number }) {
  const heights = [6, 12, 8, 14, 6, 10];
  return (
    <div className="flex items-center gap-[3px] h-[18px]">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full bg-current transition-all ${
            active ? "animate-voice-wave" : ""
          }`}
          style={{
            height: active ? undefined : heights[i % heights.length],
            animationDelay: active ? `${i * 120}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function ChatContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bindingId = Number(searchParams.get("id"));
  const studentName = searchParams.get("name") || "孩子";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [expandedTexts, setExpandedTexts] = useState<Set<number>>(new Set());
  const [durations, setDurations] = useState<Record<number, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load duration for a voice message ──
  const loadDuration = useCallback(async (idx: number, base64: string) => {
    const dur = await getAudioDuration(base64);
    setDurations((prev) => ({ ...prev, [idx]: dur }));
  }, []);

  // Load durations whenever messages change
  useEffect(() => {
    messages.forEach((msg, i) => {
      if (msg.voice_base64 && durations[i] === undefined) {
        loadDuration(i, msg.voice_base64);
      }
    });
  }, [messages, durations, loadDuration]);

  const playVoice = (base64: string, idx: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingIdx === idx) {
      setPlayingIdx(null);
      return;
    }
    const audio = new Audio(`data:audio/mp3;base64,${base64}`);
    audio.onended = () => { setPlayingIdx(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingIdx(null); audioRef.current = null; };
    audio.play();
    audioRef.current = audio;
    setPlayingIdx(idx);
  };

  const toggleText = (idx: number) => {
    setExpandedTexts((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!bindingId) return;
    parentApi
      .getHistory(bindingId)
      .then((history) => {
        setMessages(history);
        setLoadingHistory(false);
        setTimeout(scrollToBottom, 100);
      })
      .catch(() => setLoadingHistory(false));
  }, [bindingId, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setSending(true);

    const tempMsg: ChatMessage = {
      role: "parent",
      content_text: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const reply: ChatReply = await parentApi.sendMessage(bindingId, text);
      const aiMsg: ChatMessage = {
        role: "ai",
        content_text: reply.text,
        emotion_tag: reply.emotion,
        voice_base64: reply.voice_base64,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errMsg: ChatMessage = {
        role: "ai",
        content_text: "抱歉，消息发送失败了，请稍后再试~",
        emotion_tag: "concerned",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // ── Render a single message ──
  const renderMessage = (msg: ChatMessage, i: number) => {
    const isParent = msg.role === "parent";
    const hasVoice = !isParent && !!msg.voice_base64;
    const isPlaying = playingIdx === i;
    const showText = !hasVoice || expandedTexts.has(i);
    const duration = durations[i] || 0;
    const waveCount = duration <= 3 ? 3 : duration <= 10 ? 5 : duration <= 30 ? 7 : 9;

    return (
      <div
        key={msg.id || i}
        className={`flex items-end gap-2.5 anim-slide-up ${isParent ? "flex-row-reverse" : ""}`}
        style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
      >
        {/* Avatar */}
        {!isParent && (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-light/80 to-primary flex items-center justify-center shrink-0 shadow-sm mb-0.5">
            <span className="text-white text-xs font-bold">{studentName.charAt(0)}</span>
          </div>
        )}

        <div className="max-w-[75%] space-y-1">
          {/* ── Voice bar (WeChat style) ── */}
          {hasVoice && (
            <button
              onClick={() => playVoice(msg.voice_base64!, i)}
              style={{ width: getVoiceBubbleWidth(duration) }}
              className={`flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm cursor-pointer btn-press transition-all ${
                isPlaying
                  ? "bg-primary text-white"
                  : "bg-white border border-sand-200/60 text-primary hover:bg-primary-50/50"
              }`}
            >
              {isPlaying ? (
                <Square size={11} className="shrink-0 fill-current" />
              ) : (
                <Volume2 size={16} className="shrink-0" />
              )}
              <VoiceWaves active={isPlaying} count={waveCount} />
              <span className={`text-xs ml-auto tabular-nums ${isPlaying ? "text-white/70" : "text-sand-400"}`}>
                {duration > 0 ? `${duration}"` : "···"}
              </span>
            </button>
          )}

          {/* ── Text bubble ── */}
          {showText && (
            <div
              className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${
                isParent
                  ? "bg-gradient-to-br from-primary to-primary-dark text-white rounded-br-md"
                  : hasVoice
                  ? "bg-sand-50 border border-sand-200/40 text-sand-700 rounded-bl-md"
                  : "bg-white border border-sand-200/60 text-sand-800 rounded-bl-md"
              }`}
            >
              <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                {msg.content_text}
              </p>
            </div>
          )}

          {/* ── "转文字" toggle ── */}
          {hasVoice && (
            <button
              onClick={() => toggleText(i)}
              className="flex items-center gap-0.5 text-[11px] text-sand-400 hover:text-sand-600 transition-colors cursor-pointer ml-1"
            >
              <ChevronDown
                size={12}
                className={`transition-transform ${expandedTexts.has(i) ? "rotate-180" : ""}`}
              />
              {expandedTexts.has(i) ? "收起文字" : "转文字"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-dvh flex flex-col bg-[#F8F6F1]">
      {/* Chat header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-sand-200/60">
        <div className="max-w-lg mx-auto px-3 h-14 flex items-center gap-3">
          <button
            onClick={() => router.push("/parent")}
            className="p-2 -ml-1 text-sand-400 hover:text-sand-600 hover:bg-sand-100 rounded-xl transition-colors cursor-pointer btn-press"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-light/80 to-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white font-bold text-sm">{studentName.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sand-800 truncate">{studentName}</p>
            <p className="text-[10px] text-sand-400">AI 分身在线</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-success font-medium">在线</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-sand-200 border-t-primary rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 anim-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-warm-100 to-warm-200 flex items-center justify-center mx-auto mb-4">
                <Heart size={28} className="text-primary" />
              </div>
              <p className="text-sm text-sand-500 font-medium">和{studentName}的分身说句话吧</p>
              <p className="text-xs text-sand-400 mt-1">TA 会用{studentName}的方式回复你</p>
            </div>
          ) : (
            messages.map((msg, i) => renderMessage(msg, i))
          )}

          {/* Typing indicator */}
          {sending && (
            <div className="flex items-end gap-2.5 anim-fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-light/80 to-primary flex items-center justify-center shrink-0 shadow-sm">
                <span className="text-white text-xs font-bold">{studentName.charAt(0)}</span>
              </div>
              <div className="bg-white border border-sand-200/60 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-sand-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 z-20 border-t border-sand-200/60 bg-white/90 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-end gap-2.5">
            <div className="flex-1 bg-sand-50 rounded-2xl border border-sand-200/80 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                rows={1}
                className="w-full px-4 py-2.5 bg-transparent text-sm text-sand-800 placeholder:text-sand-400 focus:outline-none resize-none max-h-[120px]"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all cursor-pointer btn-press ${
                input.trim() && !sending
                  ? "bg-gradient-to-br from-primary to-primary-dark text-white shadow-sm hover:shadow-md hover:shadow-primary/20"
                  : "bg-sand-100 text-sand-300"
              }`}
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={17} />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] text-sand-300 mt-2">
            AI 分身回复 · 非本人实时消息
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-warm-200 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
