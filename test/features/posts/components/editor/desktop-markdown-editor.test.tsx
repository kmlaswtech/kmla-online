import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import DesktopMarkdownEditor from "~/features/posts/components/editor/desktop-markdown-editor";
import type { PostBodyInputHandle } from "~/features/posts/components/editor/post-body-input";
import { useMentionDraft } from "~/features/posts/hooks/use-mention-draft";
import type { PostMention } from "~/features/posts/model/mentions";

describe("DesktopMarkdownEditor", () => {
  it("loads stored underline as an underline mark and keeps lookalike text", async () => {
    render(<DesktopMarkdownEditor initialValue={":u[밑줄] 시간 10:30am"} />);

    expect(await screen.findByText("밑줄", { selector: "u" })).toBeVisible();
    expect(screen.getByLabelText("본문")).toHaveTextContent(
      "밑줄 시간 10:30am",
    );
    expect(screen.getByRole("button", { name: "밑줄" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Control+U Meta+U",
    );
  });

  it("serializes underline back to its stored syntax without escaping mentions", async () => {
    const handle = createRef<PostBodyInputHandle>();
    const onValueChange = vi.fn();
    render(
      <DesktopMarkdownEditor
        initialValue={":u[밑줄] 끝"}
        handleRef={handle}
        onValueChange={onValueChange}
      />,
    );
    await screen.findByText("밑줄", { selector: "u" });

    act(() => handle.current?.insertMentions([{ label: "한별", ordinal: 1 }]));

    await waitFor(() =>
      expect(onValueChange).toHaveBeenLastCalledWith(
        expect.stringMatching(/^\[@한별\]\(m:1\) :u\[밑줄\] 끝$/),
      ),
    );
  });

  it.each([
    // 문단 머리 `- ` 뒤에 서식이 오면 Milkdown 기본 처리기가 escape하지 않아 정화가 목록으로 읽고 `-`를 지웠다.
    ["<p>- <strong>굵게</strong></p>", "\\- **굵게**"],
    // 누구인지 실려 오지 않은 멘션 링크는 번호만으로 대상을 알 수 없어 평문으로 붙는다.
    ['<p>- <a href="m:1">@한별</a></p>', "\\- @한별"],
    // 문장부호로 끝나는 굵게 뒤에 한글이 붙으면 CommonMark에서는 `**`가 닫히지 않아 글자로 남았다.
    ["<p><strong>끝.</strong>다음</p>", "**끝.**다음"],
    ["<p>가<em>(나)</em>다</p>", "가*(나)*다"],
    ["<p>가<del>(나)</del>다</p>", "가~~(나)~~다"],
  ])("serializes %s so it reads back the same", async (html, markdown) => {
    const onValueChange = vi.fn();
    render(
      <DesktopMarkdownEditor initialValue="" onValueChange={onValueChange} />,
    );
    const editor = await screen.findByLabelText("본문");

    fireEvent.paste(editor, {
      clipboardData: {
        types: ["text/html"],
        getData: (type: string) => (type === "text/html" ? html : ""),
      },
    });

    await waitFor(() =>
      expect(onValueChange).toHaveBeenLastCalledWith(markdown),
    );
  });

  it.each([
    ["hello \nnext", "hello\nnext"],
    [" lead", "lead"],
    ["   ", ""],
  ])(
    "drops edge spaces of %j instead of saving character references",
    async (text, markdown) => {
      const onValueChange = vi.fn();
      render(
        <DesktopMarkdownEditor initialValue="" onValueChange={onValueChange} />,
      );
      const editor = await screen.findByLabelText("본문");

      fireEvent.paste(editor, {
        clipboardData: {
          types: ["text/plain"],
          getData: (type: string) => (type === "text/plain" ? text : ""),
        },
      });

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith(markdown),
      );
    },
  );

  /* eslint-disable testing-library/no-node-access --
     캐럿은 글자 노드 안에 놓아야 하고 멘션 링크는 그 노드를 감싼 `a`다. Testing Library에는 둘 다 없다. */
  describe("deleting a mention", () => {
    /** 캐럿을 글자 노드의 한 자리에 두고 ProseMirror가 읽게 한다. */
    async function placeCaret(node: Node, offset: number) {
      document.getSelection()?.collapse(node, offset);
      await act(async () => {
        document.dispatchEvent(new Event("selectionchange"));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }

    async function renderEditor(initialValue: string) {
      const onValueChange = vi.fn();
      render(
        <DesktopMarkdownEditor
          initialValue={initialValue}
          onValueChange={onValueChange}
        />,
      );
      const editor = await screen.findByLabelText("본문");
      await waitFor(() => expect(editor).toHaveTextContent("끝"));
      editor.focus();
      return { editor, onValueChange };
    }

    function deleteInput(editor: HTMLElement, inputType: string) {
      const event = new InputEvent("beforeinput", {
        inputType,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(editor, event);
      return event;
    }

    it.each([
      // 이름 가운데에서 지워도 반쪽이 남지 않는다. 남으면 저장 때 이름이 되살아나 그 사람을 부른다.
      ["deleteContentBackward", 2],
      ["deleteContentForward", 1],
      // 멘션 바로 뒤에서 Backspace를 눌러도 마지막 글자만 지우지 않는다.
      ["deleteContentBackward", 3],
    ])("removes the whole mention on %s at offset %i", async (type, offset) => {
      const { editor, onValueChange } =
        await renderEditor("앞 [@한별](m:1) 끝");
      const mention = editor.querySelector("a")!;
      await placeCaret(mention.firstChild!, offset);

      const event = deleteInput(editor, type);

      expect(event.defaultPrevented).toBe(true);
      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith("앞  끝"),
      );
      expect(editor.querySelector("a")).toBeNull();
    });

    it("leaves plain text and ordinary links to the browser", async () => {
      const { editor } = await renderEditor(
        "[링크](https://example.com) [@한별](m:1) 끝",
      );
      await placeCaret(editor.querySelector("a")!.firstChild!, 1);

      expect(
        deleteInput(editor, "deleteContentBackward").defaultPrevented,
      ).toBe(false);
    });
  });
  /* eslint-enable testing-library/no-node-access */

  describe("pasting a mention", () => {
    const 새벽: PostMention = {
      ordinal: 1,
      pub_id: "saebyeok-24",
      name: "박새벽",
      avatar_path: null,
    };
    /** 읽기 화면의 멘션 칩을 복사했을 때 클립보드에 실리는 HTML. */
    const CHIP =
      '<a data-mention="kmla-mention:hanbyeol-25:이한별" href="/profile/hanbyeol-25">@이한별</a>';

    /** 그룹 게시물 편집기처럼 멘션 초안을 물린 편집기. `refuse`는 멘션할 수 없는 글(익명)이다. */
    function EditorWithMentionDraft({
      initialValue,
      mentions,
      refuse,
      onValueChange,
    }: {
      initialValue: string;
      mentions: PostMention[];
      refuse: boolean;
      onValueChange: (value: string) => void;
    }) {
      const draft = useMentionDraft(mentions);
      return (
        <DesktopMarkdownEditor
          initialValue={initialValue}
          onValueChange={onValueChange}
          mentionClipboard={{
            targetOf: draft.targetOf,
            adopt: refuse ? () => [] : draft.adopt,
          }}
        />
      );
    }

    async function renderWithDraft({
      initialValue = "",
      mentions = [],
      refuse = false,
    }: {
      initialValue?: string;
      mentions?: PostMention[];
      refuse?: boolean;
    } = {}) {
      const onValueChange = vi.fn();
      render(
        <EditorWithMentionDraft
          initialValue={initialValue}
          mentions={mentions}
          refuse={refuse}
          onValueChange={onValueChange}
        />,
      );
      const editor = await screen.findByLabelText("본문");
      if (initialValue) {
        await waitFor(() => expect(editor).toHaveTextContent("끝"));
      }
      return { editor, onValueChange };
    }

    function pasteHtml(editor: HTMLElement, html: string) {
      fireEvent.paste(editor, {
        clipboardData: {
          types: ["text/html"],
          getData: (type: string) => (type === "text/html" ? html : ""),
        },
      });
    }

    it("keeps a mention copied from a post as a mention", async () => {
      const { editor, onValueChange } = await renderWithDraft();

      pasteHtml(editor, `<p>${CHIP} 님</p>`);

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith("[@이한별](m:1) 님"),
      );
    });

    it("keeps a mention copied in another editor", async () => {
      const { editor, onValueChange } = await renderWithDraft();

      pasteHtml(
        editor,
        '<p><a href="" title="kmla-mention:hanbyeol-25:이한별">@이한별</a> 님</p>',
      );

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith("[@이한별](m:1) 님"),
      );
    });

    it("numbers it for this post instead of taking a number already in use", async () => {
      const { editor, onValueChange } = await renderWithDraft({
        initialValue: "[@박새벽](m:1) 끝",
        mentions: [새벽],
      });

      pasteHtml(editor, `<p>${CHIP}</p>`);

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith(
          expect.stringContaining("[@이한별](m:2)"),
        ),
      );
      expect(onValueChange).toHaveBeenLastCalledWith(
        expect.stringContaining("[@박새벽](m:1)"),
      );
    });

    it("pastes plain text when only part of the name was copied", async () => {
      const { editor, onValueChange } = await renderWithDraft();

      pasteHtml(
        editor,
        '<p><a data-mention="kmla-mention:hanbyeol-25:이한별" href="/profile/hanbyeol-25">@이한</a> 님</p>',
      );

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith("@이한 님"),
      );
    });

    it("pastes plain text while the post cannot mention anyone", async () => {
      const { editor, onValueChange } = await renderWithDraft({
        refuse: true,
      });

      pasteHtml(editor, `<p>${CHIP} 님</p>`);

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith("@이한별 님"),
      );
    });

    it("pastes plain text in an editor that keeps no mentions", async () => {
      const onValueChange = vi.fn();
      render(
        <DesktopMarkdownEditor initialValue="" onValueChange={onValueChange} />,
      );
      const editor = await screen.findByLabelText("본문");

      pasteHtml(editor, `<p>${CHIP} 님</p>`);

      await waitFor(() =>
        expect(onValueChange).toHaveBeenLastCalledWith("@이한별 님"),
      );
    });

    it("copies a mention together with who it calls", async () => {
      const { editor } = await renderWithDraft({
        initialValue: "[@박새벽](m:1) 끝",
        mentions: [새벽],
      });
      editor.focus();
      document.getSelection()?.selectAllChildren(editor);
      // ProseMirror는 selectionchange를 다음 작업에서 읽는다.
      await act(async () => {
        document.dispatchEvent(new Event("selectionchange"));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const setData = vi.fn();

      fireEvent.copy(editor, {
        clipboardData: { clearData: vi.fn(), setData },
      });

      expect(setData).toHaveBeenCalledWith(
        "text/html",
        expect.stringContaining('title="kmla-mention:saebyeok-24:박새벽"'),
      );
    });
  });

  it("copies one stored line per line instead of a blank line between each", async () => {
    render(
      <DesktopMarkdownEditor initialValue={"첫 줄\n둘째 줄\n\n넷째 줄"} />,
    );
    const editor = await screen.findByLabelText("본문");
    await waitFor(() => expect(editor).toHaveTextContent("넷째 줄"));
    editor.focus();
    document.getSelection()?.selectAllChildren(editor);
    // ProseMirror는 selectionchange를 다음 작업에서 읽는다.
    await act(async () => {
      document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const setData = vi.fn();

    fireEvent.copy(editor, { clipboardData: { clearData: vi.fn(), setData } });

    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "첫 줄\n둘째 줄\n\n넷째 줄",
    );
  });
});
