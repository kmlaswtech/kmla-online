import type { ComponentType } from "react";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAuthState: vi.fn(),
  loadOAuthAuthorization: vi.fn(),
  isAcceptedMember: vi.fn(),
  decideOAuthAuthorization: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("~/features/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...mocks,
}));

import OAuthConsentPage, {
  clientAction,
  clientLoader,
} from "~/routes/auth/oauth-consent";
import { renderRoute, screen } from "../router";

const CONSENT_URL = "https://kmla.online/oauth/consent?authorization_id=abc";
const CALLBACK = "https://wiki.kmla.online/auth/callback?code=xyz&state=s";

function load(url = CONSENT_URL) {
  return clientLoader({
    params: {},
    context: new RouterContextProvider(),
    request: new Request(url),
    url: new URL(url),
    pattern: "/oauth/consent",
    serverLoader: () => Promise.resolve(undefined),
  });
}

function act(intent: string) {
  const body = new FormData();
  body.set("intent", intent);
  return clientAction({
    params: {},
    context: new RouterContextProvider(),
    request: new Request(CONSENT_URL, { method: "POST", body }),
    url: new URL(CONSENT_URL),
    pattern: "/oauth/consent",
    serverAction: () => Promise.resolve(undefined),
  });
}

/** 던지지 않으면 실패로 바꿔 둔다. 잡은 뒤에만 단정하면 리다이렉트가 사라져도 통과한다. */
async function thrownResponse(run: () => Promise<unknown>): Promise<Response> {
  try {
    await run();
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(Response);
    return thrown as Response;
  }
  throw new Error("Expected a redirect");
}

const consentLoader = (accepted: boolean) => () => ({
  kind: "consent" as const,
  clientName: "큼온 위키",
  accepted,
  email: "student@kmla.hs.kr",
});

function expectLoginBack(response: Response) {
  const location = new URL(
    response.headers.get("Location") ?? "",
    "https://kmla.online",
  );
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("next")).toBe(
    "/oauth/consent?authorization_id=abc",
  );
}

describe("OAuth consent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAuthState.mockResolvedValue({
      email: "student@kmla.hs.kr",
      profile: { status: "accepted" },
    });
    mocks.loadOAuthAuthorization.mockResolvedValue({
      kind: "consent",
      clientName: "큼온 위키",
    });
    mocks.isAcceptedMember.mockResolvedValue(true);
    mocks.decideOAuthAuthorization.mockResolvedValue(CALLBACK);
  });

  it("sends a signed-out visitor to login and back to the same request", async () => {
    mocks.loadAuthState.mockResolvedValue(null);

    expectLoginBack(await thrownResponse(() => load()));
    expect(mocks.loadOAuthAuthorization).not.toHaveBeenCalled();
  });

  it("sends the user to login again when the auth server rejects the session", async () => {
    mocks.loadOAuthAuthorization.mockResolvedValue({ kind: "signed-out" });

    expectLoginBack(await thrownResponse(() => load()));
    expect(mocks.isAcceptedMember).not.toHaveBeenCalled();
  });

  it("returns straight to the service when the user already consented", async () => {
    mocks.loadOAuthAuthorization.mockResolvedValue({
      kind: "redirect",
      url: CALLBACK,
    });

    const response = await thrownResponse(() => load());

    expect(response.headers.get("Location")).toBe(CALLBACK);
    // 동의 화면이 history에 남으면 뒤로가기가 다시 인증 서버를 거쳐 서비스로 튕긴다.
    expect(response.headers.get("X-Remix-Replace")).toBe("true");
    // 판정 RPC가 실패해도 리다이렉트는 막지 않게 동의 화면에서만 부른다.
    expect(mocks.isAcceptedMember).not.toHaveBeenCalled();
  });

  it("asks a first-time accepted member to allow or deny", async () => {
    await expect(load()).resolves.toEqual({
      kind: "consent",
      clientName: "큼온 위키",
      accepted: true,
      email: "student@kmla.hs.kr",
    });
    expect(mocks.loadOAuthAuthorization).toHaveBeenCalledWith("abc");

    renderRoute(OAuthConsentPage as ComponentType<any>, {
      path: "/oauth/consent",
      loader: consentLoader(true),
    });

    expect(
      await screen.findByRole("heading", { name: /큼온 위키/ }),
    ).toBeVisible();
    expect(screen.getByText(/회원 여부와 내부 식별 번호/)).toBeVisible();
    expect(screen.getByRole("button", { name: "허용" })).toHaveValue("approve");
    expect(screen.getByRole("button", { name: "거부" })).toHaveValue("deny");
    expect(screen.getByText("student@kmla.hs.kr")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "다른 계정으로 로그인" }),
    ).toHaveValue("switch-account");
  });

  it("signs out and returns to the same request to switch accounts", async () => {
    expectLoginBack(await thrownResponse(() => act("switch-account")));
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.decideOAuthAuthorization).not.toHaveBeenCalled();
  });

  it("lets a member who is not accepted only deny", async () => {
    mocks.loadAuthState.mockResolvedValue({
      email: "pending@kmla.hs.kr",
      profile: { status: "pending" },
    });
    mocks.isAcceptedMember.mockResolvedValue(false);

    await expect(load()).resolves.toMatchObject({ accepted: false });

    renderRoute(OAuthConsentPage as ComponentType<any>, {
      path: "/oauth/consent",
      loader: consentLoader(false),
    });

    expect(await screen.findByText(/승인된 KMLA Online 회원만/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "허용" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "거부" })).toBeVisible();
  });

  it.each([
    ["approve", "허용"],
    ["deny", "거부"],
  ])("sends the %s decision and returns to the service", async (intent) => {
    const response = await thrownResponse(() => act(intent));

    expect(mocks.decideOAuthAuthorization).toHaveBeenCalledWith("abc", intent);
    expect(response.headers.get("Location")).toBe(CALLBACK);
    expect(response.headers.get("X-Remix-Replace")).toBe("true");
  });

  it("refuses an approval from a member who is no longer accepted", async () => {
    mocks.isAcceptedMember.mockResolvedValue(false);

    const result = await act("approve");

    expect(mocks.decideOAuthAuthorization).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: { error: expect.stringMatching(/승인된 KMLA Online 회원만/) },
      init: { status: 403 },
    });
  });

  it("explains a missing or expired request", async () => {
    await expect(load("https://kmla.online/oauth/consent")).resolves.toEqual({
      kind: "missing",
    });

    mocks.loadOAuthAuthorization.mockResolvedValue({ kind: "missing" });
    await expect(load()).resolves.toEqual({ kind: "missing" });

    renderRoute(OAuthConsentPage as ComponentType<any>, {
      path: "/oauth/consent",
      loader: () => ({ kind: "missing" }),
    });
    expect(
      await screen.findByText(/연계 서비스에서 다시 로그인/),
    ).toBeVisible();
  });
});
