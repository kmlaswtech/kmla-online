import { ChevronRightIcon, ExternalLinkIcon, LinkIcon } from "lucide-react";
import { useState } from "react";

import { schoolLifeLinks } from "~/features/app-shell/model/school-links";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/shared/ui/dialog";

/** 학교 사이트 줄의 마지막 타일. 누르면 학교생활 링크 목록을 연다. */
export function SchoolLifeLinksTile({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <LinkIcon
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="min-w-0 flex-1 text-left text-sm font-medium break-keep">
          학교생활 링크
        </span>
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm gap-3 p-4">
          <DialogHeader className="px-1 pt-1">
            <DialogTitle>학교생활 링크</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {schoolLifeLinks.map(({ href, label, description, icon: Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${label}, ${description} (새 탭)`}
                  className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/80">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">
                      {label}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {description}
                    </span>
                  </span>
                  <ExternalLinkIcon
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
