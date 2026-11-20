import { ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import { data, Form, redirect, replace, useNavigation } from "react-router";

import {
  AuthCard,
  decideOAuthAuthorization,
  isAcceptedMember,
  loadAuthState,
  loadOAuthAuthorization,
  type OAuthDecision,
  signOut,
} from "~/features/auth";
import { Button } from "~/shared/ui/button";
import { FieldError } from "~/shared/ui/field";
import { Spinner } from "~/shared/ui/spinner";
import type { Route } from "./+types/oauth-consent";

/**
 * 연계 서비스 로그인 동의(accounts §4.9). 인증 서버가 `authorization_id`를 붙여 보낸다.
 * 승인 전 회원에게도 안내와 거부를 보여 줘야 연계 서비스가 `access_denied`를 받으므로 게이트 밖에 둔다.
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const authorizationId = url.searchParams.get("authorization_id");
  if (!authorizationId) return { kind: "missing" as const };

  const state = await loadAuthState();
  if (!state) throw redirect(loginUrl(url));

  const authorization = await loadOAuthAuthorization(authorizationId);
  if (authorization.kind === "signed-out") throw redirect(loginUrl(url));
  // 이미 동의한 서비스다. 동의 화면을 history에 남기면 뒤로가기가 인증 서버를 거쳐 다시 서비스로 튕긴다.
  if (authorization.kind === "redirect") throw replace(authorization.url);
  if (authorization.kind === "missing") return authorization;
  // 판정은 동의 화면에서만 쓴다. 미리 불러 두면 이 RPC가 실패할 때 멀쩡한 리다이렉트까지 오류가 된다.
  const accepted = await isAcceptedMember();
  return { ...authorization, accepted, email: state.email };
}

/** 로그인 뒤 같은 동의 화면으로 돌아오게 한다. */
function loginUrl(url: URL): string {
  const next = `${url.pathname}${url.search}`;
  return `/login?${new URLSearchParams({ next })}`;
}

/**
 * 허용은 화면이 승인 회원에게만 보여 주지만, 화면을 연 뒤 상태가 바뀌었거나 허용을 직접 보내도
 * 동의가 기록되지 않게 보내기 전에 다시 확인한다. 이 확인도 브라우저 코드라 최종 판정은
 * 연계 서비스가 `get_external_identity`로 한다.
 */
export async function clientAction({ request }: Route.ClientActionArgs) {
  const authorizationId = new URL(request.url).searchParams.get(
    "authorization_id",
  );
  const intent = (await request.formData()).get("intent");
  // 다른 계정으로 동의하려면 로그아웃한 뒤 같은 요청으로 돌아온다.
  if (intent === "switch-account") {
    try {
      await signOut();
    } catch {
      return data(
        {
          error: "로그아웃하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
        },
        { status: 503 },
      );
    }
    throw redirect(loginUrl(new URL(request.url)));
  }
  if (!authorizationId || (intent !== "approve" && intent !== "deny")) {
    return data({ error: "요청을 처리하지 못했어요." }, { status: 400 });
  }

  // 판정 RPC가 잠깐 실패한 것을 만료로 안내하면 멀쩡한 요청을 버리고 처음부터 하게 된다.
  if (intent === "approve") {
    let accepted: boolean;
    try {
      accepted = await isAcceptedMember();
    } catch {
      return data(
        { error: "회원 여부를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    if (!accepted) {
      return data(
        { error: "승인된 KMLA Online 회원만 로그인할 수 있어요." },
        { status: 403 },
      );
    }
  }

  try {
    const redirectUrl = await decideOAuthAuthorization(
      authorizationId,
      intent satisfies OAuthDecision,
    );
    throw replace(redirectUrl);
  } catch (error) {
    if (error instanceof Response) throw error;
    return data(
      {
        error:
          "로그인 요청을 처리하지 못했어요. 로그인을 시작한 서비스에서 다시 시도해 주세요.",
      },
      { status: 400 },
    );
  }
}

export default function OAuthConsentPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const submittedIntent = navigation.formData?.get("intent");

  if (loaderData.kind === "missing") {
    return (
      <AuthCard
        title="로그인 요청을 찾을 수 없어요"
        description="로그인을 시작한 서비스에서 다시 시도해 주세요."
      />
    );
  }

  const { clientName, accepted, email } = loaderData;

  return (
    <AuthCard title={`${clientName} 로그인`}>
      {/* 동의 폼의 기본 버튼(첫 submit)이 계정 전환이 되지 않도록 폼을 나눈다. */}
      <Form
        method="post"
        className="mb-6 flex items-center justify-between gap-3 text-sm"
      >
        <p className="min-w-0 truncate">
          <span className="text-muted-foreground">로그인한 계정 </span>
          <span className="font-medium">{email}</span>
        </p>
        <Button
          type="submit"
          name="intent"
          value="switch-account"
          variant="link"
          size="sm"
          className="shrink-0"
          disabled={submitting}
        >
          {submittedIntent === "switch-account" ? (
            <Spinner data-icon="inline-start" />
          ) : null}
          계정 변경
        </Button>
      </Form>
      <Form method="post" className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted p-6 text-center">
          <div
            className={
              accepted
                ? "flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
                : "flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            }
          >
            {accepted ? (
              <ShieldCheckIcon className="size-6" />
            ) : (
              <ShieldXIcon className="size-6" />
            )}
          </div>
          {accepted ? (
            <p className="text-sm leading-6">
              KMLA Online 계정으로 로그인하면 {clientName}에 가입 승인 여부와
              계정 연결에 쓰는 프로필 번호만 전달돼요.
            </p>
          ) : (
            <p className="text-sm leading-6">
              승인된 KMLA Online 회원만 로그인할 수 있어요.
            </p>
          )}
        </div>
        {actionData?.error ? <FieldError>{actionData.error}</FieldError> : null}
        <div className="flex flex-col gap-3">
          {accepted ? (
            <Button
              type="submit"
              name="intent"
              value="approve"
              disabled={submitting}
            >
              {submittedIntent === "approve" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              동의하고 로그인
            </Button>
          ) : null}
          <Button
            type="submit"
            name="intent"
            value="deny"
            variant={accepted ? "ghost" : "default"}
            disabled={submitting}
          >
            {submittedIntent === "deny" ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            취소
          </Button>
        </div>
      </Form>
    </AuthCard>
  );
}
