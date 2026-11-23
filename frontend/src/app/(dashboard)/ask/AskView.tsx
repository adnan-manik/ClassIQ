"use client";

import Select from "@/components/Select";
import MarkdownMessage from "@/components/MarkdownMessage";
import { askClassIQ } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { ChatTurn, LLMQueryResponse, LLMStatus } from "@/lib/types";
import { AlertTriangle, Bot, Send, Sparkles, Trash2, User } from "lucide-react";
import { useRef, useState } from "react";

const SUGGESTIONS = [
  "Which teacher is the best fit for the section with the lowest compatibility score, and why?",
  "Which sections have a hindering social graph, and what is dragging the score down?",
  "Compare my latest scenario with the current assignment. Should I apply it?",
  "Which sections have open early-warning flags this week?",
  "Summarise the learning-style makeup of the department in three sentences.",
];

interface Bubble extends ChatTurn {
  meta?: LLMQueryResponse;
  error?: boolean;
}

export default function AskView({
  status,
  loadError,
  userName,
  departments,
}: {
  status: LLMStatus | null;
  loadError: string | null;
  userName: string;
  departments: { id: string; name: string; code: string }[];
}) {
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [deptId, setDeptId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(loadError);
  const bottomRef = useRef<HTMLDivElement>(null);

  const enabled = !!status?.enabled;

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const history: ChatTurn[] = messages
      .filter((m) => !m.error)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await askClassIQ(q, history, deptId || null);
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer, meta: res }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "The assistant could not answer";
      setMessages((prev) => [...prev, { role: "assistant", content: msg, error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
            Ask ClassIQ
          </h1>
          <p className="text-base mt-1.5 max-w-2xl" style={{ color: BRAND.textHeading, opacity: 0.7 }}>
            Plain-English questions over your institution&apos;s sections, teachers, scenarios
            and simulation results. Answers cite the factor scores behind them and are
            decision support, not guarantees.
          </p>
        </div>
        {departments.length > 1 && (
          <label className="text-xs font-semibold flex items-center gap-2" style={{ color: BRAND.textMuted }}>
            Scope
            <Select
              value={deptId}
              onChange={setDeptId}
              className="min-w-[200px]"
              options={[
                { value: "", label: "Whole institution" },
                ...departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
              ]}
            />
          </label>
        )}
      </div>

      {error && (
        <div
          className="text-sm rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {status && !status.enabled && (
        <div
          className="text-sm rounded-xl px-4 py-3"
          style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
        >
          The assistant is not configured on this backend ({status.reason ?? "no API key"}).
          Set <code>ANTHROPIC_API_KEY</code> in <code>backend/.env</code> and restart FastAPI.
        </div>
      )}

      {/* Conversation */}
      <div
        className="rounded-3xl bg-white p-5 md:p-6 min-h-[360px] flex flex-col"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-8">
            <div className="w-14 h-14 rounded-full grid place-items-center" style={{ backgroundColor: BRAND.tealLight }}>
              <Sparkles size={24} style={{ color: BRAND.teal }} />
            </div>
            <div>
              <div className="font-semibold" style={{ color: BRAND.text }}>
                Hi {userName.split(" ")[0]} — what are you planning?
              </div>
              <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                Try one of these, or type your own question below.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => send(s)}
                  className="text-left text-xs px-3 py-2 rounded-full disabled:opacity-50 transition hover:opacity-90"
                  style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark, border: `1px solid ${BRAND.cardBorder}` }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-auto max-h-[60vh] pr-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: m.error ? "#FEE2E2" : BRAND.tealLight }}>
                    <Bot size={16} style={{ color: m.error ? "#991B1B" : BRAND.teal }} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] min-w-0 rounded-2xl px-4 py-3 text-sm ${
                    m.role === "assistant" && !m.error ? "" : "whitespace-pre-wrap"
                  }`}
                  style={{
                    backgroundColor: m.role === "user" ? BRAND.teal : m.error ? "#FEE2E2" : BRAND.subtleBg,
                    color: m.role === "user" ? "white" : m.error ? "#991B1B" : BRAND.text,
                  }}
                >
                  {m.role === "assistant" && !m.error ? (
                    <MarkdownMessage content={m.content} />
                  ) : (
                    m.content
                  )}
                  {m.meta && (
                    <div className="text-[10px] mt-2 pt-2 flex gap-2 flex-wrap" style={{ color: BRAND.textSubtle, borderTop: `1px solid ${BRAND.cardBorder}` }}>
                      <span>{m.meta.model}</span>
                      <span>· {m.meta.usage.input_tokens + m.meta.usage.cache_read_input_tokens} in / {m.meta.usage.output_tokens} out</span>
                      {m.meta.usage.cache_read_input_tokens > 0 && <span>· cache hit</span>}
                      <span>· context: {m.meta.context.sections} sections, {m.meta.context.teachers} teachers, {m.meta.context.scenarios} scenarios</span>
                      {m.meta.refusal && <span style={{ color: "#991B1B" }}>· declined</span>}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: BRAND.purpleLight }}>
                    <User size={16} style={{ color: BRAND.purple }} />
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: BRAND.tealLight }}>
                  <Bot size={16} style={{ color: BRAND.teal }} />
                </div>
                <div className="rounded-2xl px-4 py-3 text-sm italic" style={{ backgroundColor: BRAND.subtleBg, color: BRAND.textMuted }}>
                  Reading the planning data…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="mt-4 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={enabled ? "Ask about sections, teachers, scenarios… (Enter to send)" : "Assistant not configured"}
            disabled={!enabled || busy}
            rows={2}
            className="flex-1 px-4 py-3 rounded-2xl text-sm outline-none resize-none disabled:opacity-60"
            style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
          />
          <button
            type="submit"
            disabled={!enabled || busy || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND.teal }}
          >
            <Send size={15} /> Ask
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="inline-flex items-center gap-1.5 px-3 py-3 rounded-2xl text-sm font-semibold"
              style={{ backgroundColor: BRAND.subtleBg, color: BRAND.textMuted }}
              title="Clear conversation"
            >
              <Trash2 size={15} />
            </button>
          )}
        </form>
        {status?.enabled && (
          <p className="text-[11px] mt-2" style={{ color: BRAND.textSubtle }}>
            Model {status.model} ({status.provider}) · answers capped at {status.max_output_tokens} tokens · questions are logged to the audit trail.
          </p>
        )}
      </div>
    </div>
  );
}
