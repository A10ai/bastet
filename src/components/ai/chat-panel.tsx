"use client";

import { useState, useRef, useEffect } from "react";
import {
  Brain,
  X,
  Send,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "ai";
  content: string;
  timestamp: string;
}

const QUICK_PROMPTS = [
  "How full are we?",
  "Who's arriving today?",
  "Any urgent maintenance?",
  "What rates should I set?",
  "Show me VIP guests",
  "Energy savings?",
];

export function AIChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      content:
        "I'm your HospitAI assistant. Ask me anything about the property — occupancy, revenue, guests, maintenance, pricing, energy. I pull live data from all systems.",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = {
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const json = await res.json();

      if (json.data) {
        setMessages((prev) => [...prev, json.data]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai" as const,
            content: "Sorry, something went wrong. Try again.",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai" as const,
          content: "Connection error. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-bastet-gold text-bastet-bg flex items-center justify-center shadow-lg shadow-bastet-gold/20 hover:scale-105 transition-transform"
          title="Ask HospitAI"
        >
          <Brain className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 z-50 w-full sm:w-[420px] h-[600px] sm:h-[640px] sm:bottom-6 sm:right-6 sm:rounded-xl flex flex-col bg-bastet-card border border-bastet-border shadow-2xl transition-all duration-300",
          open
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-8 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bastet-border">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-bastet-gold" />
            <span className="font-semibold text-text-primary text-sm">
              HospitAI
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {msg.role === "ai" && (
                <div className="w-7 h-7 rounded-lg bg-bastet-gold-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-3.5 h-3.5 text-bastet-gold" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-bastet-gold text-bastet-bg"
                    : "bg-bastet-bg border border-bastet-border text-text-primary"
                )}
              >
                {msg.content.split("\n").map((line, j) => {
                  // Simple markdown-like rendering
                  const formatted = line
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/⭐|💡|✅|🔴|🟡|⚪|⚠️/g, (match) => `<span>${match}</span>`);

                  if (line.startsWith("- ")) {
                    return (
                      <div
                        key={j}
                        className="ml-2 text-[13px]"
                        dangerouslySetInnerHTML={{ __html: formatted.slice(2) }}
                      />
                    );
                  }
                  return (
                    <div
                      key={j}
                      className={line === "" ? "h-2" : ""}
                      dangerouslySetInnerHTML={{ __html: formatted }}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-lg bg-bastet-gold-muted flex items-center justify-center shrink-0">
                <Brain className="w-3.5 h-3.5 text-bastet-gold animate-pulse" />
              </div>
              <div className="bg-bastet-bg border border-bastet-border rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 2 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-bastet-bg border border-bastet-border text-text-secondary hover:text-bastet-gold hover:border-bastet-gold/30 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-bastet-border">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask HospitAI anything..."
              className="flex-1 bg-bastet-bg border border-bastet-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-bastet-gold/40 transition-colors"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-lg bg-bastet-gold text-bastet-bg disabled:opacity-30 hover:opacity-90 transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
