import klhLogo from "../assets/klh-logo.png";
import drkLogo from "../assets/drk-logo.svg";

const LOGO_BY_SCHOOL = { KLH: klhLogo, DRK: drkLogo } as const;
const ALT_BY_SCHOOL = { KLH: "KLH University", DRK: "DRK Institution" } as const;

export function Logo({
  className = "h-10",
  school = "KLH",
}: {
  className?: string;
  school?: "KLH" | "DRK";
}) {
  return <img src={LOGO_BY_SCHOOL[school]} alt={ALT_BY_SCHOOL[school]} className={className} />;
}
