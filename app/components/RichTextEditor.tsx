import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";
import { Text } from "@shopify/polaris";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const BASE_BTN: React.CSSProperties = {
  background: "none",
  border: "1px solid transparent",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  padding: "2px 6px",
  lineHeight: 1.5,
  color: "#202223",
  minWidth: 24,
};

const RTE_STYLES = `
.kfo-rte { display: flex; flex-direction: column; }
.kfo-rte > .ProseMirror-wrapper, .kfo-rte > div:last-child { flex: 1; }
.kfo-rte .ProseMirror { outline: none; min-height: 80px; height: 100%; padding: 8px 12px; font-size: 14px; line-height: 1.6; box-sizing: border-box; }
.kfo-rte .ProseMirror p { margin: 0 0 4px; }
.kfo-rte .ProseMirror h1 { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
.kfo-rte .ProseMirror h2 { font-size: 17px; font-weight: 700; margin: 8px 0 4px; }
.kfo-rte .ProseMirror h3 { font-size: 15px; font-weight: 700; margin: 6px 0 4px; }
.kfo-rte .ProseMirror ul, .kfo-rte .ProseMirror ol { padding-left: 20px; margin: 0 0 4px; }
.kfo-rte .ProseMirror li { margin-bottom: 2px; }
.kfo-rte .ProseMirror strong { font-weight: 700; }
.kfo-rte .ProseMirror em { font-style: italic; }
.kfo-rte .ProseMirror u { text-decoration: underline; }
.kfo-rte .ProseMirror s { text-decoration: line-through; }
`;

export function RichTextEditor({ label, value, onChange }: Props) {
  useEffect(() => {
    const id = "kfo-rte-styles";
    if (!document.getElementById(id)) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = RTE_STYLES;
      document.head.appendChild(el);
    }
  }, []);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "");
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function btnStyle(active: boolean): React.CSSProperties {
    return {
      ...BASE_BTN,
      backgroundColor: active ? "#e4e5e7" : "transparent",
      borderColor: active ? "#c9cccf" : "transparent",
    };
  }

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor?.isActive(name, attrs) ?? false;

  const sep = (
    <div style={{ width: 1, background: "#e1e3e5", margin: "2px 4px", alignSelf: "stretch" }} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: 4 }}>
        <Text as="span" variant="bodyMd">{label}</Text>
      </div>
      <div className="kfo-rte" style={{ border: "1px solid #8c9196", borderRadius: 4, background: "#fff", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ borderBottom: "1px solid #e1e3e5", padding: "4px 6px", display: "flex", gap: 2, alignItems: "center", background: "#fafbfb", borderRadius: "4px 4px 0 0", flexWrap: "wrap" }}>
          {/* Text style */}
          <button type="button" style={btnStyle(isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold">
            <strong>B</strong>
          </button>
          <button type="button" style={btnStyle(isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic">
            <em>I</em>
          </button>
          <button type="button" style={{ ...btnStyle(isActive("underline")), textDecoration: "underline" }} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline">
            U
          </button>
          <button type="button" style={{ ...btnStyle(isActive("strike")), textDecoration: "line-through" }} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough">
            S
          </button>

          {sep}

          {/* Headings */}
          <button type="button" style={btnStyle(isActive("heading", { level: 1 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
            H1
          </button>
          <button type="button" style={btnStyle(isActive("heading", { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            H2
          </button>
          <button type="button" style={btnStyle(isActive("heading", { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            H3
          </button>

          {sep}

          {/* Lists */}
          <button type="button" style={btnStyle(isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">
            ≡
          </button>
          <button type="button" style={btnStyle(isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Ordered list">
            1.
          </button>
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
