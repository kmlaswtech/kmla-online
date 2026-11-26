import {
  BookOpenIcon,
  FlaskConicalIcon,
  GraduationCapIcon,
  LogInIcon,
  NewspaperIcon,
  SchoolIcon,
} from "lucide-react";
import type { ComponentType } from "react";

interface ServiceLink {
  /** 없으면 아직 열지 않은 서비스로, 누를 수 없게 "준비 중"으로 보인다. */
  href?: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

/** 링크 모음 화면의 묶음. 묶음마다 카드 하나로 띄워 보인다. */
export const serviceLinkGroups: ServiceLink[][] = [
  [
    { label: "큼온 위키", icon: BookOpenIcon },
    { label: "Minjok Herald", icon: NewspaperIcon },
  ],
  [
    {
      href: "https://minjok.net/paper/",
      label: "KMLA Research Hub",
      icon: FlaskConicalIcon,
    },
  ],
  [
    { href: "https://www.minjok.hs.kr/", label: "홈페이지", icon: SchoolIcon },
    {
      href: "https://old.minjok.hs.kr/members/login.php",
      label: "인트라넷",
      icon: LogInIcon,
    },
    {
      href: "https://minjok.riroschool.kr/",
      label: "리로스쿨",
      icon: GraduationCapIcon,
    },
  ],
];
