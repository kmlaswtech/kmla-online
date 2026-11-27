import { describe, expect, it } from "vitest";

import {
  getAnonymousActivityRestrictionErrorMessage,
  getCommentErrorMessage,
  getPostErrorMessage,
} from "~/features/posts/model/format";

describe("post error messages", () => {
  it("says which mention blocks saving when its target is not a group member", () => {
    // 다른 그룹의 글에서 붙여 넣은 멘션이 여기로 온다. 일반 문구로는 무엇을 고칠지 알 수 없다.
    expect(
      getPostErrorMessage({
        code: "22023",
        message: "every mention must name a current group member",
      }),
    ).toBe(
      "이 그룹의 멤버가 아닌 사람이 멘션되어 있습니다. 해당 멘션을 지운 뒤 다시 시도해 주세요.",
    );
  });
});

describe("anonymous activity restriction error messages", () => {
  it("maps write rejection and moderation conflicts to Korean messages", () => {
    const writeError = { message: "anonymous activity is restricted" };
    expect(getPostErrorMessage(writeError)).toBe(
      "이 그룹에서는 현재 익명 활동이 제한되어 있습니다.",
    );
    expect(getCommentErrorMessage(writeError)).toBe(
      "이 그룹에서는 현재 익명 활동이 제한되어 있습니다.",
    );
    expect(
      getAnonymousActivityRestrictionErrorMessage({
        message: "anonymous activity restriction already active",
      }),
    ).toBe("이미 익명 활동이 차단된 사용자입니다.");
    expect(
      getAnonymousActivityRestrictionErrorMessage({
        message: "anonymous activity restriction already cancelled",
      }),
    ).toBe("이미 해제되었거나 만료된 익명 활동 차단입니다.");
  });
});
