import klhLogo from "../assets/klh-logo.png";
import drkLogo from "../assets/drk-logo.svg";
import rajasLogo from "../assets/rajas-bakery-logo.svg";

/* The canteen operator's own mark, as opposed to the institution logos below.
   Intrinsic size is 366x422 (the asset's viewBox is cropped to the artwork —
   the original export padded it into a 500x500 square, which made every
   height-based size render ~16% smaller than asked for, off-centre vertically).
   The width/height attributes are load-bearing: they give the element an
   aspect-ratio before the SVG loads, so the card below it never jumps.
   Callers pass a complete className and should constrain ONE axis only
   (`h-* w-auto`) — constraining both would squash the portrait artwork. */
export function BrandMark({ className = "h-24 w-auto" }: { className?: string }) {
  return (
    <img
      src={rajasLogo}
      alt="Raja's Bakery"
      width={366}
      height={422}
      draggable={false}
      className={className}
    />
  );
}

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
