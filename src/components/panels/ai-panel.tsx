"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiPanelProps {
  systemPrompt: string;
  contextSummary: string;
  onClose: () => void;
}

export function AiPanel({ systemPrompt, contextSummary, onClose }: AiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          systemPrompt,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Error: ${res.status}`);
        setMessages(newMessages);
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            if (json.content) {
              fullContent += json.content;
              setMessages([
                ...newMessages,
                { role: "assistant", content: fullContent },
              ]);
            }
          } catch {
            // skip
          }
        }
      }

      if (!fullContent) {
        setMessages(newMessages);
        setError("No response received");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Request failed");
        setMessages(newMessages);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming, systemPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = () => {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    setError(null);
  };

  const renderContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const lines = part.slice(3, -3).split("\n");
        const lang = lines[0]?.trim();
        const code = (lang ? lines.slice(1) : lines).join("\n");
        return (
          <pre
            key={i}
            className="bg-black/40 border border-border rounded p-2 my-1 overflow-x-auto text-[10px] text-neon-green/80 leading-relaxed"
          >
            {code}
          </pre>
        );
      }

      return part.split("\n").map((line, j) => {
        if (line.startsWith("# ")) {
          return (
            <div key={`${i}-${j}`} className="text-xs font-bold text-neon-cyan mt-2 mb-1">
              {line.slice(2)}
            </div>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <div key={`${i}-${j}`} className="text-[11px] font-semibold text-neon-green mt-1.5 mb-0.5">
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <div key={`${i}-${j}`} className="text-[10px] pl-2 text-foreground/80">
              {line}
            </div>
          );
        }

        const formatted = line.replace(
          /`([^`]+)`/g,
          '<code class="bg-black/30 px-1 py-0.5 rounded text-neon-amber text-[9px]">$1</code>'
        );

        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <div key={`${i}-${j}`} className="text-[10px] font-semibold text-foreground mt-1">
              {line.slice(2, -2)}
            </div>
          );
        }

        return line ? (
          <span
            key={`${i}-${j}`}
            className="text-[10px] text-foreground/80"
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        ) : (
          <br key={`${i}-${j}`} />
        );
      });
    });
  };

  return (
    <div className="w-80 flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bot className="w-3.5 h-3.5 text-neon-purple" />
            <Sparkles className="w-2 h-2 text-neon-amber absolute -top-0.5 -right-0.5" />
          </div>
          <span className="text-xs font-medium">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="text-muted-foreground hover:text-neon-red transition-colors p-0.5"
            title="Clear history"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Context Banner */}
      <div className="border-b border-border">
        <button
          onClick={() => setShowContext(!showContext)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Context injected from active view</span>
          {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showContext && (
          <div className="px-3 pb-2">
            <pre className="text-[8px] text-muted-foreground/70 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/20 rounded p-1.5">
              {contextSummary || "No context available"}
            </pre>
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {messages.length === 0 && !error && (
            <div className="text-center py-8">
              <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[10px] text-muted-foreground">
                Ask about your cluster, diagnose issues, or get architecture advice
              </p>
              <div className="mt-3 space-y-1">
                {[
                  "Why are my pods crashing?",
                  "Review my deployment plan",
                  "How do I fix ImagePullBackOff?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      inputRef.current?.focus();
                    }}
                    className="block w-full text-left text-[9px] text-muted-foreground/60 hover:text-neon-cyan px-2 py-1 rounded hover:bg-accent/30 transition-colors"
                  >
                    &quot;{q}&quot;
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === "user" ? "" : ""}`}>
              <div className="shrink-0 mt-0.5">
                {msg.role === "user" ? (
                  <User className="w-3 h-3 text-neon-cyan" />
                ) : (
                  <Bot className="w-3 h-3 text-neon-purple" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {msg.role === "user" ? (
                  <p className="text-[10px] text-foreground">{msg.content}</p>
                ) : msg.content ? (
                  <div className="leading-relaxed">{renderContent(msg.content)}</div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 text-neon-purple animate-spin" />
                    <span className="text-[9px] text-muted-foreground">Thinking...</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="text-[10px] text-neon-red bg-neon-red/5 border border-neon-red/20 rounded p-2">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-1.5 bg-[var(--terminal-header)] rounded border border-border focus-within:border-neon-cyan/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your cluster..."
            rows={1}
            className="flex-1 bg-transparent text-[10px] text-foreground px-2 py-1.5 resize-none focus:outline-none max-h-20"
            style={{ minHeight: "28px" }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="p-1.5 text-muted-foreground hover:text-neon-cyan disabled:opacity-30 transition-colors shrink-0"
          >
            {streaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
