"use client";

import type { MutableRefObject } from "react";
import Editor from "@monaco-editor/react";
import { Button, Space, Tag, Typography } from "antd";

const { Text } = Typography;

export function MonacoHtmlEditor({
  value,
  onChange,
  height = "360px",
  editorRef,
}: {
  value?: string;
  onChange?: (val: string) => void;
  height?: string;
  editorRef?: MutableRefObject<import("monaco-editor").editor.IStandaloneCodeEditor | null>;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--nb-border)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)",
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #0f3460",
        }}
      >
        <Space size={4}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57", border: "1px solid rgba(0,0,0,.2)" }} />
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e", border: "1px solid rgba(0,0,0,.2)" }} />
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840", border: "1px solid rgba(0,0,0,.2)" }} />
        </Space>
        <Text style={{ color: "#858585", fontSize: 11, fontFamily: "monospace", marginLeft: 6 }}>HTML</Text>
        <Tag style={{ marginLeft: "auto", fontSize: 10, background: "#0f3460", border: "1px solid #1a4a7a", color: "#7eb3ff" }}>
          Monaco
        </Tag>
      </div>
      <Editor
        height={height}
        language="html"
        value={value ?? ""}
        onChange={(val) => onChange?.(val ?? "")}
        onMount={(ed) => {
          if (editorRef) editorRef.current = ed;
        }}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
          wordWrap: "on",
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          folding: true,
          bracketPairColorization: { enabled: true },
          formatOnPaste: true,
          formatOnType: true,
          renderWhitespace: "selection",
          padding: { top: 8, bottom: 8 },
        }}
      />
    </div>
  );
}
