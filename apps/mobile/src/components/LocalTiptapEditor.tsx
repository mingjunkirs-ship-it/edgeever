'use dom';

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { TiptapDoc } from "@edgeever/shared";
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from "expo/dom";
import { useCallback, useEffect, useRef, type ReactNode, type Ref } from "react";

type EditorDoc = TiptapDoc;

type PickedImage = {
  alt: string;
  url: string;
};

export interface LocalTiptapEditorRef extends DOMImperativeFactory {
  flush: () => void;
  focus: () => void;
  focusEnd: () => void;
  replaceAll: DOMImperativeFactory[string];
  search: DOMImperativeFactory[string];
}

type LocalTiptapEditorProps = {
  baseUrl: string;
  content: EditorDoc;
  dom?: DOMProps;
  onChange: (content: EditorDoc) => Promise<void>;
  onPickImage: () => Promise<PickedImage | null>;
  onReady: (startupMs: number) => Promise<void>;
  onSearchState?: (count: number, activeIndex: number) => Promise<void>;
  ref: Ref<LocalTiptapEditorRef>;
  locale: "zh-CN" | "en-US";
  theme: "light" | "dark";
};

const CHANGE_IDLE_MS = 500;

export default function LocalTiptapEditor(props: LocalTiptapEditorProps) {
  const startedAtRef = useRef(performance.now());
  const changeTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef(props.onChange);
  const onPickImageRef = useRef(props.onPickImage);
  const onReadyRef = useRef(props.onReady);
  const onSearchStateRef = useRef(props.onSearchState);

  onChangeRef.current = props.onChange;
  onPickImageRef.current = props.onPickImage;
  onReadyRef.current = props.onReady;
  onSearchStateRef.current = props.onSearchState;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        allowBase64: false,
        inline: false,
      }),
      Placeholder.configure({
        placeholder: props.locale === "en-US" ? "Start writing..." : "开始记录...",
      }),
    ],
    content: resolveImageSources(props.content, props.baseUrl),
    editorProps: {
      attributes: {
        autocapitalize: "sentences",
        autocomplete: "on",
        autocorrect: "on",
        class: "edgeever-editor-content",
        inputmode: "text",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (changeTimerRef.current !== null) {
        window.clearTimeout(changeTimerRef.current);
      }
      changeTimerRef.current = window.setTimeout(() => {
        changeTimerRef.current = null;
        void onChangeRef.current(normalizeImageSources(activeEditor.getJSON() as EditorDoc, props.baseUrl));
      }, CHANGE_IDLE_MS);
    },
  });

  const flush = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    if (changeTimerRef.current !== null) {
      window.clearTimeout(changeTimerRef.current);
      changeTimerRef.current = null;
    }
    void onChangeRef.current(normalizeImageSources(editor.getJSON() as EditorDoc, props.baseUrl));
  }, [editor, props.baseUrl]);

  const findSearchMatches = useCallback((query: string) => {
    const needle = query.trim().toLocaleLowerCase();
    if (!editor || editor.isDestroyed || needle.length === 0) {
      return [];
    }

    const characters: Array<{ char: string; pos: number }> = [];
    let previousTextEnd: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) {
        return;
      }
      if (previousTextEnd !== null && pos > previousTextEnd) {
        characters.push({ char: "\u0000", pos: -1 });
      }
      for (let index = 0; index < node.text.length; index += 1) {
        characters.push({ char: node.text[index] ?? "", pos: pos + index });
      }
      previousTextEnd = pos + node.text.length;
    });

    const haystack = characters.map((item) => item.char).join("").toLocaleLowerCase();
    const matches: Array<{ from: number; to: number }> = [];
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const start = characters[index];
      const end = characters[index + needle.length - 1];
      if (start && end && start.pos >= 0 && end.pos >= 0) {
        matches.push({ from: start.pos, to: end.pos + 1 });
      }
      index = haystack.indexOf(needle, index + needle.length);
    }
    return matches;
  }, [editor]);

  const search = useCallback((query: string, requestedIndex: number) => {
    const matches = findSearchMatches(query);
    const activeIndex = matches.length > 0
      ? ((Math.trunc(requestedIndex) % matches.length) + matches.length) % matches.length
      : 0;
    const match = matches[activeIndex];
    if (match && editor && !editor.isDestroyed) {
      editor.chain().setTextSelection(match).scrollIntoView().run();
    }
    void onSearchStateRef.current?.(matches.length, activeIndex);
  }, [editor, findSearchMatches]);

  const replaceAll = useCallback((query: string, replacement: string) => {
    const matches = findSearchMatches(query);
    if (!editor || editor.isDestroyed || matches.length === 0) {
      void onSearchStateRef.current?.(0, 0);
      return;
    }

    editor.chain().command(({ tr, dispatch }) => {
      for (const match of [...matches].reverse()) {
        tr.insertText(replacement, match.from, match.to);
      }
      dispatch?.(tr);
      return true;
    }).run();
    window.requestAnimationFrame(() => search(query, 0));
  }, [editor, findSearchMatches, search]);

  useDOMImperativeHandle(
    props.ref,
    () => ({
      flush,
      focus: () => editor?.commands.focus(),
      focusEnd: () => editor?.commands.focus("end"),
      replaceAll: (...args: Parameters<DOMImperativeFactory[string]>) => replaceAll(String(args[0] ?? ""), String(args[1] ?? "")),
      search: (...args: Parameters<DOMImperativeFactory[string]>) => search(String(args[0] ?? ""), Number(args[1] ?? 0)),
    }),
    [editor, flush, replaceAll, search]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    void onReadyRef.current(Math.round(performance.now() - startedAtRef.current));
    const handlePageHide = () => flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (changeTimerRef.current !== null) {
        window.clearTimeout(changeTimerRef.current);
      }
    };
  }, [editor, flush]);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) =>
      (activeEditor?.isActive("bold") ? 1 : 0) |
      (activeEditor?.isActive("bulletList") ? 8 : 0) |
      (activeEditor?.isActive("blockquote") ? 16 : 0),
  });

  const insertImage = async () => {
    if (!editor) {
      return;
    }
    const image = await onPickImageRef.current();
    if (image) {
      editor.chain().focus().setImage({ alt: image.alt, src: resolveUrl(image.url, props.baseUrl) }).run();
    }
  };

  return (
    <div className="edgeever-editor-shell">
      <style>{getEditorStyles(props.theme)}</style>
      <div aria-label={props.locale === "en-US" ? "Editor toolbar" : "编辑器工具栏"} className="edgeever-editor-toolbar" role="toolbar">
        <ToolbarButton icon={<ImagePlusIcon />} label={props.locale === "en-US" ? "Upload image" : "上传图片"} onRun={() => void insertImage()} />
        <ToolbarButton active={Boolean(toolbarState & 1)} icon={<BoldIcon />} label={props.locale === "en-US" ? "Bold" : "加粗"} onRun={() => editor?.chain().focus().toggleBold().run()} />
        <ToolbarButton active={Boolean(toolbarState & 8)} icon={<ListIcon />} label={props.locale === "en-US" ? "Bullet list" : "无序列表"} onRun={() => editor?.chain().focus().toggleBulletList().run()} />
        <ToolbarButton active={Boolean(toolbarState & 16)} icon={<QuoteIcon />} label={props.locale === "en-US" ? "Quote" : "引用"} onRun={() => editor?.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton icon={<MinusIcon />} label={props.locale === "en-US" ? "Horizontal rule" : "分割线"} onRun={() => editor?.chain().focus().setHorizontalRule().run()} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

const ToolbarButton = ({ active = false, icon, label, onRun }: { active?: boolean; icon: ReactNode; label: string; onRun: () => void }) => (
  <button
    aria-label={label}
    aria-pressed={active}
    className={active ? "is-active" : undefined}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onRun}
    type="button"
  >
    {icon}
  </button>
);

const EditorIcon = ({ children, size, strokeWidth }: { children: ReactNode; size: number; strokeWidth: number }) => (
  <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}>
    {children}
  </svg>
);

// Keep the same Lucide paths as the PWA toolbar without pulling the full icon
// barrel into the standalone DOM bundle (which adds roughly 1.8 MB in Metro).
const ImagePlusIcon = () => (
  <EditorIcon size={18} strokeWidth={2}>
    <path d="M16 5h6" />
    <path d="M19 2v6" />
    <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    <circle cx="9" cy="9" r="2" />
  </EditorIcon>
);

const BoldIcon = () => (
  <EditorIcon size={17} strokeWidth={2.4}>
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </EditorIcon>
);

const ListIcon = () => (
  <EditorIcon size={18} strokeWidth={2.2}>
    <path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13" />
  </EditorIcon>
);

const QuoteIcon = () => (
  <EditorIcon size={17} strokeWidth={2.2}>
    <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
    <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
  </EditorIcon>
);

const MinusIcon = () => (
  <EditorIcon size={18} strokeWidth={2.4}>
    <path d="M5 12h14" />
  </EditorIcon>
);

const mapImageSources = (doc: EditorDoc, mapSource: (source: string) => string): EditorDoc => {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(visit);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const node = value as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(node).map(([key, child]) => [key, visit(child)]));
    if (node.type === "image" && next.attrs && typeof next.attrs === "object") {
      const attrs = next.attrs as Record<string, unknown>;
      if (typeof attrs.src === "string") {
        next.attrs = { ...attrs, src: mapSource(attrs.src) };
      }
    }
    return next;
  };

  return visit(doc) as EditorDoc;
};

const resolveImageSources = (doc: EditorDoc, baseUrl: string) => mapImageSources(doc, (source) => resolveUrl(source, baseUrl));

const normalizeImageSources = (doc: EditorDoc, baseUrl: string) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return mapImageSources(doc, (source) => source.startsWith(`${normalizedBaseUrl}/`) ? source.slice(normalizedBaseUrl.length) : source);
};

const resolveUrl = (source: string, baseUrl: string) => {
  if (!source.startsWith("/")) {
    return source;
  }
  return `${baseUrl.replace(/\/+$/, "")}${source}`;
};

const getEditorStyles = (theme: "light" | "dark") => `
  :root { color-scheme: ${theme}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  html, body, #root { width: 100%; height: 100%; margin: 0; background: ${theme === "dark" ? "#0f172a" : "#fff"}; }
  body { overflow: hidden; color: ${theme === "dark" ? "#f8fafc" : "#0f172a"}; }
  .edgeever-editor-shell { display: flex; height: 100%; min-height: 100%; flex-direction: column; background: ${theme === "dark" ? "#0f172a" : "#fff"}; }
  .edgeever-editor-toolbar { display: flex; flex: 0 0 auto; align-items: center; gap: 4px; min-height: 38px; overflow-x: auto; padding: 6px 12px; border-block: 1px solid ${theme === "dark" ? "#334155" : "#f1f5f9"}; background: ${theme === "dark" ? "#0f172a" : "#fff"}; scrollbar-width: none; }
  .edgeever-editor-toolbar::-webkit-scrollbar { display: none; }
  .edgeever-editor-toolbar button { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 36px; min-height: 32px; padding: 0; border: 1px solid transparent; border-radius: 999px; background: transparent; color: ${theme === "dark" ? "#cbd5e1" : "#64748b"}; }
  .edgeever-editor-toolbar button:active, .edgeever-editor-toolbar button.is-active { border-color: ${theme === "dark" ? "#166534" : "#bbf7d0"}; background: ${theme === "dark" ? "#14532d" : "#ecfdf5"}; color: ${theme === "dark" ? "#86efac" : "#047857"}; }
  .tiptap { min-height: 100%; outline: none; }
  .edgeever-editor-shell > div:last-child { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
  .edgeever-editor-content { min-height: 100%; padding: 18px 12px 32px; font-size: 17px; line-height: 1.7; word-break: break-word; caret-color: #0f766e; }
  .edgeever-editor-content > :first-child { margin-top: 0; }
  .edgeever-editor-content p.is-editor-empty:first-child::before { float: left; height: 0; color: #94a3b8; content: attr(data-placeholder); pointer-events: none; }
  .edgeever-editor-content h1, .edgeever-editor-content h2, .edgeever-editor-content h3 { line-height: 1.3; }
  .edgeever-editor-content blockquote { margin-left: 0; padding-left: 14px; border-left: 3px solid #5eead4; color: ${theme === "dark" ? "#cbd5e1" : "#475569"}; }
  .edgeever-editor-content pre { overflow-x: auto; border-radius: 10px; padding: 14px; background: #0f172a; color: #e2e8f0; }
  .edgeever-editor-content code { border-radius: 4px; padding: 2px 4px; background: ${theme === "dark" ? "#1e293b" : "#f1f5f9"}; }
  .edgeever-editor-content pre code { padding: 0; background: transparent; }
  .edgeever-editor-content img { display: block; max-width: 100%; height: auto; margin: 14px auto; border-radius: 10px; }
  .edgeever-editor-content hr { margin: 24px 0; border: 0; border-top: 1px solid #cbd5e1; }
`;
