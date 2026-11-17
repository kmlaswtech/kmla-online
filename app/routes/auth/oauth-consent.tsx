import { ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import { data, Form, redirect, replace, useNavigation } from "react-router";

import {
  AuthCard,
  decideOAuthAuthorization,
  isAcceptedMember,
  loadAuthState,
  loadOAuthAuthorization,
  type OAuthDecision,
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
  if (!state) {
    const next = `${url.pathname}${url.search}`;
    throw redirect(`/login?${new URLSearchParams({ next })}`);
  }

  const [authorization, accepted] = await Promise.all([
    loadOAuthAuthorization(authorizationId),
    isAcceptedMember(),
  ]);
  // 이미 동의한 서비스다. 동의 화면을 history에 남기면 뒤로가기가 인증 서버를 거쳐 다시 서비스로 튕긴다.
  if (authorization.kind === "redirect") throw replace(authorization.url);
  if (authorization.kind === "missing") return authorization;
  return { ...authorization, accepted };
}

/**
 * 허용은 화면이 승인 회원에게만 보여 준다. 그 밖의 회원이 허용을 보내도 연계 서비스가
 * `get_external_identity`로 다시 확인해 거절하므로 여기서 다시 막지 않는다.
 */
export async function clientAction({ request }: Route.ClientActionArgs) {
  const authorizationId = new URL(request.url).searchParams.get(
    "authorization_id",
  );
  const intent = (await request.formData()).get("intent");
  if (!authorizationId || (intent !== "approve" && intent !== "deny")) {
    return data({ error: "요청을 처리하지 못했어요." }, { status: 400 });
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
          "요청이 만료되었거나 처리하지 못했어요. 연계 서비스에서 다시 로그인해 주세요.",
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
        description="요청이 만료되었거나 잘못된 주소예요. 연계 서비스에서 다시 로그인해 주세요."
      />
    );
  }

  const { clientName, accepted } = loaderData;

  return (
    <AuthCard
      title={`${clientName} 로그인`}
      description={`${clientName}에서 KMLA Online 계정으로 로그인하려고 해요.`}
    >
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
              허용하면 {clientName}에 회원 여부와 내부 식별 번호만 전달돼요.
            </p>
          ) : (
            <p className="text-sm leading-6">
              승인된 KMLA Online 회원만 이용할 수 있어요. 가입 승인이 끝난 뒤
              다시 시도해 주세요.
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
              허용
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
            거부
          </Button>
        </div>
      </Form>
    </AuthCard>
  );
}
