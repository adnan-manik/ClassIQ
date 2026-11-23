"use client";

import { BRAND } from "@/lib/brand";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders an assistant answer as Markdown (GFM: bold, lists, tables, code).
 * Raw HTML in the source is ignored by react-markdown, so model output can't
 * inject markup; links open in a new tab.
 */
const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold" style={{ color: BRAND.textHeading }}>
      {children}
    </strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="text-base font-bold mt-3 mb-1.5 first:mt-0" style={{ color: BRAND.textHeading }}>{children}</h3>,
  h2: ({ children }) => <h3 className="text-base font-bold mt-3 mb-1.5 first:mt-0" style={{ color: BRAND.textHeading }}>{children}</h3>,
  h3: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1 first:mt-0" style={{ color: BRAND.textHeading }}>{children}</h4>,
  h4: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1 first:mt-0" style={{ color: BRAND.textHeading }}>{children}</h4>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>ul]:my-1 [&>ol]:my-1">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
      style={{ color: BRAND.teal }}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="pl-3 my-2 italic"
      style={{ borderLeft: `3px solid ${BRAND.cardBorder}`, color: BRAND.textMuted }}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3" style={{ borderColor: BRAND.cardBorder }} />,
  code: ({ className, children }) => {
    // Fenced blocks carry a language-* class; inline code doesn't.
    const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
    return isBlock ? (
      <code className={`${className ?? ""} font-mono text-xs`}>{children}</code>
    ) : (
      <code
        className="font-mono text-[0.85em] px-1 py-0.5 rounded"
        style={{ backgroundColor: "rgba(15, 118, 110, 0.08)" }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      className="my-2 p-3 rounded-lg overflow-x-auto text-xs"
      style={{ backgroundColor: "#ffffff", border: `1px solid ${BRAND.cardBorder}` }}
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      className="text-left font-semibold px-2.5 py-1.5"
      style={{ ...style, borderBottom: `2px solid ${BRAND.cardBorder}`, color: BRAND.textHeading }}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className="px-2.5 py-1.5 align-top" style={{ ...style, borderBottom: `1px solid ${BRAND.cardBorder}` }}>
      {children}
    </td>
  ),
};

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
