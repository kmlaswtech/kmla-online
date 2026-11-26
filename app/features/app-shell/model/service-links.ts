import { BookOpenIcon, FlaskConicalIcon, NewspaperIcon } from "lucide-react";
import type { ComponentType } from "react";

interface ServiceLink {
  /** 없으면 아직 열지 않은 서비스로, 누를 수 없게 "준비 중"으로 보인다. */
  href?: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export const serviceLinks: ServiceLink[] = [
  {
    href: "https://minjok.net/paper/",
    label: "KMLA Research Hub",
    icon: FlaskConicalIcon,
  },
  { label: "큼온 위키", icon: BookOpenIcon },
  { label: "KMLA News", icon: NewspaperIcon },
];
