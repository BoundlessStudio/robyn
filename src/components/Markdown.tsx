"use client";

import { memo } from "react";
import { Streamdown, type StreamdownProps } from "streamdown";

type MarkdownProps = Pick<StreamdownProps, "mode" | "isAnimating" | "components" | "controls"> & {
  content: string;
  className?: string;
};

// One renderer for saved employee notes, research documents and live AI replies.
// Streaming mode tolerates incomplete Markdown; saved text uses the static parser.
export const Markdown = memo(function Markdown({
  content,
  className = "",
  mode = "static",
  controls = false,
  ...props
}: MarkdownProps) {
  return <Streamdown {...props} mode={mode} controls={controls} className={`ai-markdown ${className}`}>{content}</Streamdown>;
});
