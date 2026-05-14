"use client";

import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Button, Space, Tabs, Tag, Typography } from "antd";
import type { editor } from "monaco-editor";
import { MonacoHtmlEditor } from "./MonacoHtmlEditor";
import { QuillMergeEditor, type QuillMergeEditorHandle } from "./QuillMergeEditor";

const { Text } = Typography;

export const EMAIL_MERGE_VARIABLES = [
  { key: "prenom", label: "{{prenom}}", token: "{{prenom}}" },
  { key: "entreprise", label: "{{entreprise}}", token: "{{entreprise}}" },
  { key: "actu", label: "{{actu}}", token: "{{actu}}" },
  { key: "custom", label: "{{custom}}", token: "{{custom}}" },
] as const;

export function EmailHtmlDualEditor({
  value,
  onChange,
  monacoHeight = "420px",
  quillHeight = 360,
}: {
  value?: string;
  onChange?: (html: string) => void;
  monacoHeight?: string;
  quillHeight?: number;
}) {
  const [tab, setTab] = useState<"visual" | "html">("visual");
  const monacoRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const quillMergeRef = useRef<QuillMergeEditorHandle>(null);

  const insertToken = useCallback(
    (token: string) => {
      if (tab === "html" && monacoRef.current) {
        const ed = monacoRef.current;
        const sel = ed.getSelection();
        if (sel) {
          ed.executeEdits("merge-var", [{ range: sel, text: token, forceMoveMarkers: true }]);
        } else {
          const model = ed.getModel();
          if (model) {
            const end = model.getFullModelRange().getEndPosition();
            ed.executeEdits("merge-var", [
              {
                range: {
                  startLineNumber: end.lineNumber,
                  startColumn: end.column,
                  endLineNumber: end.lineNumber,
                  endColumn: end.column,
                },
                text: token,
                forceMoveMarkers: true,
              },
            ]);
          }
        }
        ed.focus();
        const v = ed.getModel()?.getValue() ?? "";
        onChange?.(v);
        return;
      }

      if (tab === "visual") {
        const q = quillMergeRef.current?.getEditor();
        if (q) {
          const range = q.getSelection(true);
          const idx = range ? range.index : q.getLength();
          q.insertText(idx, token, "user");
          q.setSelection(idx + token.length, 0, "silent");
          const el = q.root as HTMLElement;
          onChange?.(el.innerHTML);
        }
        return;
      }

      onChange?.(`${value ?? ""}${token}`);
    },
    [onChange, tab, value],
  );

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
          Variables de fusion (clic pour insérer à la position du curseur) :
        </Text>
        <Space wrap size={[6, 6]}>
          {EMAIL_MERGE_VARIABLES.map((v) => (
            <Button key={v.key} size="small" type="dashed" onClick={() => insertToken(v.token)}>
              {v.label}
            </Button>
          ))}
        </Space>
      </div>
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as "visual" | "html")}
        items={[
          {
            key: "visual",
            label: (
              <Space size={4}>
                <span>Visuel</span>
                <Tag style={{ margin: 0 }}>WYSIWYG</Tag>
              </Space>
            ),
            children: (
              <QuillMergeEditor
                ref={quillMergeRef}
                value={value ?? ""}
                onChange={(html) => onChange?.(html)}
                minHeight={quillHeight}
              />
            ),
          },
          {
            key: "html",
            label: (
              <Space size={4}>
                <span>HTML</span>
                <Tag style={{ margin: 0 }}>Monaco</Tag>
              </Space>
            ),
            children: (
              <MonacoHtmlEditor
                value={value}
                onChange={onChange}
                height={monacoHeight}
                editorRef={monacoRef as MutableRefObject<editor.IStandaloneCodeEditor | null>}
              />
            ),
          },
        ]}
      />
    </Space>
  );
}
