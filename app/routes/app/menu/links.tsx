import { ExternalLinkIcon } from "lucide-react";

import { defineAppChrome, PageHeader } from "~/features/app-shell";
import { serviceLinks } from "~/features/app-shell/model/service-links";
import { cn } from "~/shared/lib/utils";
import { Badge } from "~/shared/ui/badge";

export const handle = defineAppChrome({
  header: "sticky",
  bottomNav: "sticky",
  contentWidth: "3xl",
});

const rowClassName = "flex min-h-14 items-center gap-3 px-4 py-3";

export default function LinksPage() {
  return (
    <>
      <PageHeader title="링크 모음" back="/menu" />

      <div className="flex w-full flex-col gap-6 p-4 md:p-0">
        <h1 className="hidden text-2xl font-semibold md:block">링크 모음</h1>

        <ul
          aria-label="링크 모음"
          className="divide-y overflow-hidden rounded-xl border bg-card"
        >
          {serviceLinks.map(({ href, label, icon: Icon }) => (
            <li key={label} aria-disabled={href ? undefined : true}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${label} (새 탭)`}
                  className={cn(
                    rowClassName,
                    "transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                  )}
                >
                  <Icon
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium break-keep">
                    {label}
                  </span>
                  <ExternalLinkIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </a>
              ) : (
                <div className={cn(rowClassName, "opacity-50")}>
                  <Icon
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium break-keep">
                    {label}
                  </span>
                  <Badge variant="secondary">준비 중</Badge>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
