import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createGroupPostWithAttachments,
  preuploadGroupPostFiles,
  updateGroupPostWithAttachments,
} = vi.hoisted(() => ({
  createGroupPostWithAttachments: vi.fn(),
  preuploadGroupPostFiles: vi.fn(),
  updateGroupPostWithAttachments: vi.fn(),
}));

vi.mock("~/features/posts/components/editor/post-body-input", async () => {
  const { useImperativeHandle, useRef } = await import("react");
  return {
    PostBodyInput: ({
      value,
      onValueChange,
      handleRef,
      mentionClipboard,
    }: {
      value: string;
      onValueChange?: (value: string) => void;
      handleRef?: React.RefObject<{
        getValue(): string | undefined;
        insertMentions(mentions: { label: string; ordinal: number }[]): void;
      } | null>;
      mentionClipboard?: {
        adopt(
          targets: { pubId: string; name: string }[],
          usedOrdinals: number[],
        ): { pubId: string; ordinal: number }[];
      };
    }) => {
      const pendingPaste = useRef<string | null>(null);
      useImperativeHandle(handleRef, () => ({
        getValue: () => pendingPaste.current ?? value,
        insertMentions(mentions: { label: string; ordinal: number }[]) {
          onValueChange?.(
            value +
              mentions
                .map(({ label, ordinal }) => `[@${label}](m:${ordinal}) `)
                .join(""),
          );
        },
      }));
      // 편집기가 붙여 넣은 멘션을 받는 방식 그대로다: 초안이 번호를 주면 토큰, 안 주면 평문.
      const pasteMention = (delayChange = false) => {
        const target = { pubId: "member-2", name: "붙여넣은 멤버" };
        const [assigned] = mentionClipboard?.adopt([target], []) ?? [];
        const next =
          value +
          (assigned
            ? `[@${target.name}](m:${assigned.ordinal}) `
            : `@${target.name} `);
        if (delayChange) pendingPaste.current = next;
        else onValueChange?.(next);
      };
      return (
        <>
          <textarea
            aria-label="Markdown 본문"
            value={value}
            onChange={(event) => onValueChange?.(event.target.value)}
          />
          <button type="button" onClick={() => pasteMention()}>
            멘션 붙여넣기
          </button>
          <button type="button" onClick={() => pasteMention(true)}>
            변경 알림 전 멘션 붙여넣기
          </button>
        </>
      );
    },
  };
});

vi.mock("~/features/posts/components/mention-button", () => ({
  MentionButton: ({
    onSelect,
  }: {
    onSelect: (candidates: object[]) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelect([
          {
            pub_id: "member-1",
            name: "테스트 멤버",
            cohort: 30,
            is_returning_student: false,
            profile_type: "student",
            avatar_path: null,
          },
        ])
      }
    >
      멘션 추가
    </button>
  ),
}));

vi.mock("~/features/posts/data/mutations", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createGroupPostWithAttachments,
  preuploadGroupPostFiles,
  updateGroupPostWithAttachments,
}));

import { GroupPostEditor } from "~/features/posts/components/group/group-post-editor";
import { renderRoute, screen } from "../../../../router";

type EditorProps = Parameters<typeof GroupPostEditor>[0];

function renderEditor(overrides: Partial<EditorProps> = {}) {
  const props: EditorProps = {
    mode: "create",
    slug: "test",
    groupName: "테스트 그룹",
    groupId: "group-id",
    categories: [],
    identities: ["identified"],
    ...overrides,
  };
  return renderRoute(() => <GroupPostEditor {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  createGroupPostWithAttachments.mockResolvedValue("post-id");
  preuploadGroupPostFiles.mockResolvedValue(undefined);
});

/**
 * 저장은 route action이 아니라 이 컴포넌트가 직접 돌린다(`AGENTS.md`: 파일 처리·진행률·재시도는
 * 소유 기능에 둔다). 그래서 검증도 폼 제출이 실제로 뮤테이션에 닿는지로 확인한다 — action을
 * 따로 시험하면 제출이 그 action에 닿지 않아도 초록불이 켜진다.
 */
describe("GroupPostEditor 저장 경로", () => {
  it("공백뿐인 제목을 Supabase까지 보내지 않는다", async () => {
    // 빈 제목은 `required`가 브라우저 단에서 막는다. 공백만 채운 제목은 통과하므로 여기서부터가
    // `validatePostForm`의 몫이다.
    const { user } = renderEditor();

    await user.type(screen.getByLabelText("제목"), "   ");
    await user.type(screen.getByLabelText("Markdown 본문"), "본문");
    await user.click(screen.getByRole("button", { name: "게시" }));

    expect(createGroupPostWithAttachments).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "제목을 입력해 주세요.",
    );
  });

  it("폼 제출이 뮤테이션까지 닿는다", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const { user } = renderEditor({ onSaved });

    await user.type(screen.getByLabelText("제목"), "제목");
    await user.type(screen.getByLabelText("Markdown 본문"), "본문");
    await user.click(screen.getByRole("button", { name: "게시" }));

    await vi.waitFor(() =>
      expect(createGroupPostWithAttachments).toHaveBeenCalledWith(
        "group-id",
        expect.objectContaining({
          title: "제목",
          body: "본문",
          authorIdentity: "identified",
        }),
        [],
        expect.anything(),
        expect.anything(),
      ),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("고를 수 없는 신원이 폼에 실려 와도 실명으로 떨어뜨린다", async () => {
    // 폼 값은 DOM에서 온다. `readPostForm`의 화이트리스트가 유일한 경계다.
    const { user } = renderEditor({ identities: ["identified", "anonymous"] });
    const identity = screen.getByLabelText<HTMLSelectElement>("작성 신원");
    identity.insertAdjacentHTML(
      "beforeend",
      '<option value="staff">운영진</option>',
    );
    await user.selectOptions(identity, "staff");

    await user.type(screen.getByLabelText("제목"), "제목");
    await user.type(screen.getByLabelText("Markdown 본문"), "본문");
    await user.click(screen.getByRole("button", { name: "게시" }));

    expect(createGroupPostWithAttachments).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "선택할 수 없는 작성 신원입니다.",
    );
  });

  it("파일을 선택하면 게시 전 업로드를 시작한다", async () => {
    const { user } = renderEditor();
    const file = new File(["내용"], "note.txt", { type: "text/plain" });

    await user.upload(screen.getByLabelText("파일 선택"), file);

    await vi.waitFor(() =>
      expect(preuploadGroupPostFiles).toHaveBeenCalledWith(
        "group-id",
        "identified",
        [expect.objectContaining({ file })],
        expect.anything(),
      ),
    );
  });

  it("변경 알림 전에 게시해도 붙여 넣은 멘션과 대상을 보낸다", async () => {
    const { user } = renderEditor();

    await user.type(screen.getByLabelText("제목"), "제목");
    await user.click(
      screen.getByRole("button", { name: "변경 알림 전 멘션 붙여넣기" }),
    );
    await user.click(screen.getByRole("button", { name: "게시" }));

    await vi.waitFor(() =>
      expect(createGroupPostWithAttachments).toHaveBeenCalledWith(
        "group-id",
        expect.objectContaining({
          body: expect.stringContaining("[@붙여넣은 멤버](m:1)"),
          mentions: [{ ordinal: 1, pubId: "member-2", name: "붙여넣은 멤버" }],
        }),
        [],
        expect.anything(),
        expect.anything(),
      ),
    );
  });

  it("익명으로 쓰는 동안에는 붙여 넣은 멘션을 받지 않는다", async () => {
    const { user } = renderEditor({ identities: ["anonymous"] });

    await user.click(screen.getByRole("button", { name: "멘션 붙여넣기" }));

    expect(screen.getByLabelText("Markdown 본문")).toHaveValue(
      "@붙여넣은 멤버 ",
    );
  });

  it("활성 멘션이 있으면 익명 신원으로 바꾸지 않는다", async () => {
    const { user } = renderEditor({ identities: ["identified", "anonymous"] });

    await user.click(screen.getByRole("button", { name: "멘션 추가" }));
    await user.selectOptions(screen.getByLabelText("작성 신원"), "anonymous");

    expect(screen.getByLabelText<HTMLSelectElement>("작성 신원")).toHaveValue(
      "identified",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "멘션을 모두 지운 뒤 익명으로 전환할 수 있습니다.",
    );
  });
});
