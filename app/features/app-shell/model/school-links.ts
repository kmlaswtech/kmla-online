import {
  ClipboardListIcon,
  FlaskConicalIcon,
  GraduationCapIcon,
  LogInIcon,
  SchoolIcon,
} from "lucide-react";
import type { ComponentType } from "react";

interface ExternalLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

export const schoolLinks: ExternalLink[] = [
  {
    href: "https://www.minjok.hs.kr/",
    label: "홈페이지",
    icon: SchoolIcon,
  },
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
];

/**
 * 학교 사이트는 아니지만 학교생활에 자주 쓰는 외부 링크. 메뉴의 학교 사이트 마지막 타일을 누르면
 * 열리는 목록에 모아, 학교 사이트 줄을 늘리지 않고 링크를 더할 수 있게 한다.
 */
export const schoolLifeLinks: (ExternalLink & { description: string })[] = [
  {
    // gid는 시트의 상벌점 확인 탭을 바로 연다.
    href: "https://docs.google.com/spreadsheets/d/165mM75gJkalE1geuobB60YWLSvPzzIe-ssecshSnwKk/edit#gid=48965601",
    label: "학생회 상벌점 확인",
    description: "구글 시트",
    icon: ClipboardListIcon,
  },
  {
    href: "https://minjok.net/paper/index.php",
    label: "리서치 허브",
    description: "학생 연구 아카이브",
    icon: FlaskConicalIcon,
  },
];
