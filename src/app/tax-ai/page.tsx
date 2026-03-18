"use client";

import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  Send,
  Plus,
  Database,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Search,
  ShieldCheck,
  X,
  Download,
  Paperclip,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
  rowCount?: number | null;
  error?: string | null;
  fileName?: string | null;
  fileDownload?: { name: string; content: string } | null;
}

const PRESET_CARDS = [
  {
    icon: FileSpreadsheet,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
    title: "Analyze my data",
    description: "Upload a CSV and get insights on your trading activity.",
  },
  {
    icon: Search,
    iconColor: "#16A34A",
    iconBg: "#F0FDF4",
    title: "Audit my taxes",
    description: "Review your taxes with AI and find potential issues.",
  },
  {
    icon: ShieldCheck,
    iconColor: "#9333EA",
    iconBg: "#FAF5FF",
    title: "Check for spam",
    description: "Review assets and flag suspected spam or dust attacks.",
  },
];

export default function TaxAIPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSql, setExpandedSql] = useState<number | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFileContent, setAttachedFileContent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status } = useSession();

  const inChat = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("File must be under 2MB");
      return;
    }
    setAttachedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedFileContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const clearFile = () => {
    setAttachedFile(null);
    setAttachedFileContent(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadCsv = (name: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const sendMessage = async (question: string) => {
    if (!question.trim() || isLoading) return;

    const displayContent = attachedFile
      ? `${question}\n\n📎 ${attachedFile.name}`
      : question;

    const userMessage: Message = {
      role: "user",
      content: displayContent,
      fileName: attachedFile?.name || null,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const payload: Record<string, unknown> = {
      question,
      history: messages.slice(-10),
    };
    if (attachedFileContent) {
      payload.fileContent = attachedFileContent;
      payload.fileName = attachedFile?.name;
    }
    clearFile();

    try {
      const response = await fetch("/api/tax-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Something went wrong.", error: data.error },
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
          fileDownload: data.fileDownload || null,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to connect. Please try again.", error: "Connection failed" },
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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.json"
          className="hidden"
          onChange={handleFileSelect}
        />

        {!inChat ? (
          /* ── LANDING STATE ─────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            {/* Bold heading */}
            <h1
              className="text-[32px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-8 text-center"
              style={{ letterSpacing: "-0.02em" }}
            >
              Let&apos;s make taxes a tad easier.
            </h1>

            {/* Glowing input box */}
            <div className="ai-glow-box w-full max-w-[560px] mb-8">
              <div className="flex items-center gap-2 bg-white dark:bg-[#1A1A1A] rounded-2xl border border-[#E5E5E0] dark:border-[#333] px-4 py-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center h-8 w-8 rounded-full border border-[#E5E5E0] dark:border-[#444] text-[#9CA3AF] hover:text-[#6B7280] hover:border-[#9CA3AF] transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>

                <div className="flex-1 relative">
                  {attachedFile && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-[#2563EB] bg-[#EFF6FF] dark:bg-[#1A1A3A] rounded-md px-2 py-1 w-fit">
                      <Paperclip className="h-3 w-3" />
                      {attachedFile.name}
                      <button onClick={clearFile} className="ml-1 hover:text-[#1A1A1A]">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything"
                    rows={1}
                    className="w-full bg-transparent border-0 outline-none resize-none text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5] placeholder:text-[#C0C0B8] py-0.5"
                  />
                </div>

                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full transition-all shrink-0",
                    input.trim() && !isLoading
                      ? "bg-[#2563EB] text-white shadow-md shadow-blue-500/20 hover:bg-[#1D4ED8]"
                      : "bg-[#E5E5E0] dark:bg-[#333] text-[#9CA3AF] cursor-not-allowed"
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Preset cards */}
            <div className="grid grid-cols-3 gap-3 max-w-[560px] w-full">
              {PRESET_CARDS.map((card) => (
                <button
                  key={card.title}
                  onClick={() => {
                    setInput(card.title === "Analyze my data" ? "" : "");
                    if (card.title === "Analyze my data") {
                      fileInputRef.current?.click();
                    } else if (card.title === "Audit my taxes") {
                      sendMessage("Audit my tax data — look for potential issues, missing cost basis, unusual transactions, and anything that might need attention before filing.");
                    } else if (card.title === "Check for spam") {
                      sendMessage("Check my transactions for spam tokens, dust attacks, or suspicious low-value assets. Flag anything that looks like spam.");
                    }
                  }}
                  className="text-left p-4 rounded-xl border border-[#E5E5E0] dark:border-[#333] bg-white dark:bg-[#1A1A1A] hover:border-[#C0C0B8] dark:hover:border-[#444] transition-colors group"
                >
                  <div
                    className="flex items-center justify-center h-8 w-8 rounded-lg mb-3"
                    style={{ backgroundColor: card.iconBg }}
                  >
                    <card.icon className="h-4 w-4" style={{ color: card.iconColor }} />
                  </div>
                  <h3 className="text-[13px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-1">{card.title}</h3>
                  <p className="text-[12px] text-[#9CA3AF] leading-snug">{card.description}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── CHAT STATE ─────────────────────────────────────── */
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-1 space-y-4 pb-4 pt-2">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-[#1A1A1A] dark:bg-[#F5F5F5] text-white dark:text-[#1A1A1A]"
                        : "bg-[#F5F5F0] dark:bg-[#1E1E1E] text-[#1A1A1A] dark:text-[#F5F5F5]"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="space-y-2">
                        <div
                          className="text-[13px] leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_code]:text-[12px] [&_code]:bg-black/5 [&_code]:dark:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded"
                          dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                        />
                        {msg.fileDownload && (
                          <button
                            onClick={() => handleDownloadCsv(msg.fileDownload!.name, msg.fileDownload!.content)}
                            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-[12px] font-medium hover:bg-[#1D4ED8] transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            Download {msg.fileDownload.name}
                          </button>
                        )}
                        {msg.sql && (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpandedSql(expandedSql === i ? null : i)}
                              className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                            >
                              <Database className="h-3 w-3" />
                              SQL query
                              {msg.rowCount !== null && ` (${msg.rowCount} rows)`}
                              {expandedSql === i ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {expandedSql === i && (
                              <pre className="mt-1.5 p-2.5 rounded-lg bg-[#1A1A1A] dark:bg-[#0D0D0D] text-[11px] text-[#93C5FD] overflow-x-auto font-mono">
                                {msg.sql}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#F5F5F0] dark:bg-[#1E1E1E] rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-[12px] text-[#9CA3AF]">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input bar */}
            <div className="border-t border-[#E5E5E0] dark:border-[#333] pt-3 pb-2 px-1">
              <div className="flex items-end gap-2 bg-[#F5F5F0] dark:bg-[#1E1E1E] rounded-xl px-3 py-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center h-7 w-7 rounded-full text-[#9CA3AF] hover:text-[#6B7280] transition-colors shrink-0 mb-0.5"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <div className="flex-1">
                  {attachedFile && (
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[#2563EB] bg-[#EFF6FF] dark:bg-[#1A1A3A] rounded-md px-2 py-0.5 w-fit">
                      <Paperclip className="h-3 w-3" />
                      {attachedFile.name}
                      <button onClick={clearFile} className="ml-1 hover:text-[#1A1A1A]"><X className="h-3 w-3" /></button>
                    </div>
                  )}
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask a follow-up..."
                    rows={1}
                    className="w-full bg-transparent border-0 outline-none resize-none text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5] placeholder:text-[#C0C0B8] py-1"
                    style={{ maxHeight: 120 }}
                  />
                </div>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-full transition-all shrink-0 mb-0.5",
                    input.trim() && !isLoading
                      ? "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                      : "text-[#D4D4CF] cursor-not-allowed"
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/^- (.*$)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.*$)/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(.*)$/, "<p>$1</p>")
    .replace(/<p><\/p>/g, "")
    .replace(/<p><(h[123]|ul|ol|li)/g, "<$1")
    .replace(/<\/(h[123]|ul|ol|li)><\/p>/g, "</$1>");
}
