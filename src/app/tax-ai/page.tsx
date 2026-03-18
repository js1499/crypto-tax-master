"use client";

import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Send, Sparkles, Database, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
  rowCount?: number | null;
  error?: string | null;
}

const SUGGESTED_QUESTIONS = [
  "What are my top 10 assets by total trading volume?",
  "How much have I gained or lost this year?",
  "What are my biggest winning and losing trades?",
  "How many transactions do I have per month in 2025?",
  "Which DEX or exchange do I use the most?",
  "Show me all my staking and income transactions",
  "What percentage of my transactions are swaps vs transfers?",
  "What is my total fee spend across all transactions?",
];

export default function TaxAIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSql, setExpandedSql] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { status } = useSession();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/tax-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question,
          history: messages.slice(-10),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || "Something went wrong. Please try again.",
            error: data.error,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sql: data.sql,
          rowCount: data.rowCount,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Failed to connect. Please check your connection and try again.",
          error: "Connection failed",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (status === "loading") {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[80vh]">
          <Loader2 className="h-6 w-6 animate-spin text-[#9CA3AF]" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-1 pb-4">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Tax AI</h1>
            <p className="text-[12px] text-[#9CA3AF]">Ask questions about your transactions in plain English</p>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-1 space-y-4 pb-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-[#F5F5F0] dark:bg-[#222] mb-6">
                <Sparkles className="h-8 w-8 text-[#9CA3AF]" />
              </div>
              <h2 className="text-[18px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-2">
                Ask anything about your transactions
              </h2>
              <p className="text-[13px] text-[#9CA3AF] mb-8 text-center max-w-md">
                I can query your transaction database to answer questions about your trading activity, gains, losses, fees, and more.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-xl w-full">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left px-3.5 py-2.5 rounded-lg border border-[#E5E5E0] dark:border-[#333] text-[12px] text-[#6B7280] hover:bg-[#F5F5F0] dark:hover:bg-[#222] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3",
                    msg.role === "user"
                      ? "bg-[#1A1A1A] dark:bg-[#F5F5F5] text-white dark:text-[#1A1A1A]"
                      : "bg-[#F5F5F0] dark:bg-[#1E1E1E] text-[#1A1A1A] dark:text-[#F5F5F5]"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="space-y-2">
                      <div
                        className="text-[13px] leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_code]:text-[12px] [&_code]:bg-black/5 [&_code]:dark:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
                        dangerouslySetInnerHTML={{
                          __html: formatMarkdown(msg.content),
                        }}
                      />
                      {msg.sql && (
                        <div className="mt-2">
                          <button
                            onClick={() => setExpandedSql(expandedSql === i ? null : i)}
                            className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                          >
                            <Database className="h-3 w-3" />
                            SQL query
                            {msg.rowCount !== null && ` (${msg.rowCount} rows)`}
                            {expandedSql === i ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                          {expandedSql === i && (
                            <pre className="mt-1.5 p-2.5 rounded-lg bg-[#1A1A1A] dark:bg-[#0D0D0D] text-[11px] text-[#A5F3A0] overflow-x-auto font-mono">
                              {msg.sql}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px]">{msg.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#F5F5F0] dark:bg-[#1E1E1E] rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 rounded-full bg-[#9CA3AF] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[12px] text-[#9CA3AF]">Querying your data...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-[#E5E5E0] dark:border-[#333] pt-4 pb-2 px-1">
          <div className="flex items-end gap-2 bg-[#F5F5F0] dark:bg-[#1E1E1E] rounded-xl px-4 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your transactions..."
              rows={1}
              className="flex-1 bg-transparent border-0 outline-none resize-none text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5] placeholder:text-[#9CA3AF] py-1.5"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-lg transition-colors shrink-0",
                input.trim() && !isLoading
                  ? "bg-[#1A1A1A] dark:bg-[#F5F5F5] text-white dark:text-[#1A1A1A] hover:opacity-80"
                  : "text-[#D4D4CF] cursor-not-allowed"
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-[#D4D4CF] mt-2 text-center">
            AI queries your transaction database. Responses may not be perfectly accurate.
          </p>
        </div>
      </div>
    </Layout>
  );
}

/** Simple markdown→HTML converter for AI responses */
function formatMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.*?)`/g, "<code>$1</code>")
    // Headers
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    // Unordered lists
    .replace(/^- (.*$)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Ordered lists
    .replace(/^\d+\. (.*$)/gm, "<li>$1</li>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(.*)$/, "<p>$1</p>")
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, "")
    .replace(/<p><(h[123]|ul|ol|li)/g, "<$1")
    .replace(/<\/(h[123]|ul|ol|li)><\/p>/g, "</$1>");
}
