import klhLogo from "../assets/klh-logo.png";

export function Logo({ className = "h-10" }: { className?: string }) {
  return <img src={klhLogo} alt="KLH University" className={className} />;
}
