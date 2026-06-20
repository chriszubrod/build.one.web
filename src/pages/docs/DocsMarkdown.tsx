import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Thin wrapper around react-markdown + remark-gfm (same stack the agent tray
 * uses) for rendering curated docs prose. GFM tables/strikethrough supported;
 * code blocks render unstyled for now (a syntax highlighter is a deferred
 * enhancement — v1 narrative is light on code).
 */
export default function DocsMarkdown({ children }: { children: string }) {
  return (
    <div className="docs-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
