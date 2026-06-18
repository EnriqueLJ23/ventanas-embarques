import { useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useEditor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"
import type { Editor } from "@tiptap/core"
import { ImageUploadNode } from "~/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { MAX_FILE_SIZE } from "~/lib/tiptap-utils"

// Tiptap template toolbar primitives
import { Spacer } from "~/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "~/components/tiptap-ui-primitive/toolbar"

// Tiptap template UI components
import { HeadingDropdownMenu } from "~/components/tiptap-ui/heading-dropdown-menu"
import { ListDropdownMenu } from "~/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "~/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "~/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "~/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "~/components/tiptap-ui/link-popover"
import { ImageUploadButton } from "~/components/tiptap-ui/image-upload-button"
import { MarkButton } from "~/components/tiptap-ui/mark-button"
import { TextAlignButton } from "~/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "~/components/tiptap-ui/undo-redo-button"

// Tiptap template icons
import { ArrowLeftIcon } from "~/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "~/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "~/components/tiptap-icons/link-icon"
import { Button } from "~/components/tiptap-ui-primitive/button"

// Tiptap template hooks
import { useIsBreakpoint } from "~/hooks/use-is-breakpoint"
import { useCursorVisibility } from "~/hooks/use-cursor-visibility"
import { useWindowSize } from "~/hooks/use-window-size"

// Node SCSS styles
import "~/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "~/components/tiptap-node/code-block-node/code-block-node.scss"
import "~/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "~/components/tiptap-node/list-node/list-node.scss"
import "~/components/tiptap-node/heading-node/heading-node.scss"
import "~/components/tiptap-node/paragraph-node/paragraph-node.scss"
import "~/components/tiptap-node/image-node/image-node.scss"
import "~/components/tiptap-node/image-upload-node/image-upload-node.scss"

// Base Tiptap CSS variables + animations
import "~/styles/_variables.scss"
import "~/styles/_keyframe-animations.scss"

// ── Image upload → base64 (embeds directly in email HTML) ────────

async function uploadImageAsBase64(
  file: File,
  onProgress?: (event: { progress: number }) => void
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`La imagen supera el límite de ${MAX_FILE_SIZE / (1024 * 1024)} MB`)
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ progress: Math.round((e.loaded / e.total) * 100) })
    }
    reader.onload = () => resolve(reader.result as string) // full data URL
    reader.onerror = () => reject(new Error("Error al leer la imagen"))
    reader.readAsDataURL(file)
  })
}

// ── Serialize for email ───────────────────────────────────────────

export function serializeForEmail(html: string): string {
  if (typeof window === "undefined") return html

  const doc = new DOMParser().parseFromString(html, "text/html")

  // Inline highlight colours (email clients strip class-based colours)
  doc.querySelectorAll("mark[data-color]").forEach((mark) => {
    const color = mark.getAttribute("data-color")
    if (color) (mark as HTMLElement).style.backgroundColor = color
  })
  doc.querySelectorAll("mark").forEach((mark) => {
    if (!(mark as HTMLElement).style.backgroundColor)
      (mark as HTMLElement).style.backgroundColor = "#fef08a"
  })

  // Inline link styles
  doc.querySelectorAll("a").forEach((a) => {
    if (!a.style.color) a.style.color = "#0078D4"
    if (!a.style.textDecoration) a.style.textDecoration = "underline"
  })

  // Inline paragraph spacing
  doc.querySelectorAll("p").forEach((p) => {
    if (!p.style.margin) p.style.margin = "0 0 8px 0"
  })

  return doc.body.innerHTML
}

export function getActiveFormats(editor: Editor): string[] {
  const a: string[] = []
  if (editor.isActive("bold")) a.push("bold")
  if (editor.isActive("italic")) a.push("italic")
  if (editor.isActive("underline")) a.push("underline")
  if (editor.isActive("bulletList")) a.push("ul")
  if (editor.isActive("orderedList")) a.push("ol")
  return a
}

export type { Editor }

// ── Toolbar sub-views (mobile) ────────────────────────────────────

function MobileToolbarContent({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) {
  return (
    <>
      <ToolbarGroup>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeftIcon className="tiptap-button-icon" />
          {type === "highlighter" ? (
            <HighlighterIcon className="tiptap-button-icon" />
          ) : (
            <LinkIcon className="tiptap-button-icon" />
          )}
        </Button>
      </ToolbarGroup>
      <ToolbarSeparator />
      {type === "highlighter" ? <ColorHighlightPopoverContent /> : <LinkContent />}
    </>
  )
}

// ── ComposerBodyEditor ────────────────────────────────────────────

export function RichBodyEditor({
  initialValue,
  editorRef,
  onStateChange,
}: {
  initialValue?: string
  editorRef: React.MutableRefObject<Editor | null>
  onStateChange?: (formats: string[]) => void
}) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">("main")
  const toolbarRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        class: "simple-editor composer-embedded",
        "data-placeholder": "Escribe el cuerpo del recordatorio aquí…",
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: { openOnClick: false, enableClickSelection: true },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image.configure({ allowBase64: true }),
      Typography,
      Superscript,
      Subscript,
      Selection,
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 10,
        upload: uploadImageAsBase64,
        onError: (error) => console.error("Error al subir imagen:", error),
      }),
    ],
    content: initialValue ?? "",
    onSelectionUpdate: ({ editor: e }) => onStateChange?.(getActiveFormats(e)),
    onUpdate:          ({ editor: e }) => {
      editorRef.current = e
      onStateChange?.(getActiveFormats(e))
    },
    onCreate:  ({ editor: e }) => { editorRef.current = e },
    onDestroy: ()               => { editorRef.current = null },
  })

  useEffect(() => {
    if (!isMobile && mobileView !== "main") setMobileView("main")
  }, [isMobile, mobileView])

  // Keep ref synced
  if (editor && editorRef.current !== editor) editorRef.current = editor

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  return (
    <div className="composer-editor-root">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          style={isMobile ? { bottom: `calc(100% - ${height - rect.y}px)` } : undefined}
        >
          {mobileView === "main" ? (
            <>
              <Spacer />
              <ToolbarGroup>
                <UndoRedoButton action="undo" />
                <UndoRedoButton action="redo" />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
                <ListDropdownMenu modal={false} types={["bulletList", "orderedList", "taskList"]} />
                <BlockquoteButton />
                <CodeBlockButton />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <MarkButton type="bold" />
                <MarkButton type="italic" />
                <MarkButton type="strike" />
                <MarkButton type="underline" />
                {!isMobile ? (
                  <ColorHighlightPopover />
                ) : (
                  <ColorHighlightPopoverButton onClick={() => setMobileView("highlighter")} />
                )}
                {!isMobile ? (
                  <LinkPopover />
                ) : (
                  <LinkButton onClick={() => setMobileView("link")} />
                )}
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <MarkButton type="superscript" />
                <MarkButton type="subscript" />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <TextAlignButton align="left" />
                <TextAlignButton align="center" />
                <TextAlignButton align="right" />
                <TextAlignButton align="justify" />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarGroup>
                <ImageUploadButton text="Imagen" />
              </ToolbarGroup>
              <Spacer />
            </>
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="composer-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}
