"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type Quill from "quill";

const toolbarOptions = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ align: [] }],
  ["link", "blockquote", "clean"],
];

export type QuillMergeEditorHandle = {
  getEditor: () => Quill | null;
};

/**
 * Quill ne doit jamais être importé au niveau du module : il touche `document` à l’évaluation,
 * ce qui casse le SSR Next.js. Chargement dynamique uniquement dans useEffect (navigateur).
 */
export const QuillMergeEditor = forwardRef<
  QuillMergeEditorHandle,
  { value: string; onChange: (html: string) => void; minHeight: number }
>(function QuillMergeEditor({ value, onChange, minHeight }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const textChangeListenerRef = useRef<(() => void) | null>(null);
  const lastSyncedHtml = useRef<string>("");
  const applyingExternal = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    getEditor: () => quillRef.current,
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    void (async () => {
      await import("quill/dist/quill.snow.css");
      const { default: QuillCtor } = await import("quill");
      if (cancelled || !containerRef.current) return;

      const quill = new QuillCtor(containerRef.current, {
        theme: "snow",
        modules: { toolbar: toolbarOptions },
      });
      quillRef.current = quill;

      const emit = () => {
        if (applyingExternal.current) return;
        const html = quill.root.innerHTML;
        lastSyncedHtml.current = html;
        onChangeRef.current(html);
      };
      textChangeListenerRef.current = emit;
      quill.on("text-change", emit);

      const initial = value ?? "";
      if (initial.trim()) {
        quill.clipboard.dangerouslyPasteHTML(initial);
      }
      lastSyncedHtml.current = quill.root.innerHTML;
    })();

    return () => {
      cancelled = true;
      const q = quillRef.current;
      quillRef.current = null;
      const listener = textChangeListenerRef.current;
      textChangeListenerRef.current = null;
      if (q && listener) {
        q.off("text-change", listener);
      }
      el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Quill monté une fois ; sync via effet value
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const incoming = value ?? "";
    if (incoming === lastSyncedHtml.current) return;
    applyingExternal.current = true;
    try {
      quill.clipboard.dangerouslyPasteHTML(incoming || "<p><br></p>");
      lastSyncedHtml.current = quill.root.innerHTML;
    } finally {
      queueMicrotask(() => {
        applyingExternal.current = false;
      });
    }
  }, [value]);

  return (
    <div
      className="crm-email-quill"
      style={{
        border: "1px solid var(--nb-border)",
        borderRadius: 8,
        overflow: "hidden",
        minHeight,
      }}
    >
      <div ref={containerRef} />
    </div>
  );
});

QuillMergeEditor.displayName = "QuillMergeEditor";
