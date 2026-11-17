"use client";

import { useGym, type Gym } from "@/lib/gym";

// The gym's logo (from R&R Controls) or, until one is uploaded, its name set
// in plain type. Picks the dark-background logo on dark surfaces.
//   variant "chip":   small pill   [logo] Club 360 · Baner
//   variant "lockup": big header   [logo]  CLUB 360 / location
//   variant "logo":   just the logo / name
export default function GymMark({
  variant = "chip",
  onDark,
  label,
  gym: given,
  className,
}: {
  variant?: "chip" | "lockup" | "logo";
  onDark?: boolean;
  label?: string;
  gym?: Gym;
  className?: string;
}) {
  const live = useGym();
  const gym = given || live;
  const light = gym.logo || gym.logoDark;
  const dark = gym.logoDark || gym.logo;
  const logo = light ? (
    <span className={`gym-logo${onDark ? " on-dark" : ""}`} aria-hidden="true">
      {onDark ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dark || ""} alt="" className="gym-logo-img" />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={light} alt="" className="gym-logo-img only-light" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dark || ""} alt="" className="gym-logo-img only-dark" />
        </>
      )}
    </span>
  ) : null;

  if (variant === "logo") {
    return (
      <span className={`gym-mark gym-mark-logo${className ? ` ${className}` : ""}`} data-testid="gym-mark">
        {logo || <span className="gym-word">{gym.name}</span>}
        <span className="sr-only">{gym.name}</span>
      </span>
    );
  }
  if (variant === "lockup") {
    return (
      <span className={`gym-mark gym-lockup${onDark ? " on-dark" : ""}${className ? ` ${className}` : ""}`} data-testid="gym-mark">
        {logo}
        <span className="gym-lockup-text">
          {label && <span className="gym-lockup-label">{label}</span>}
          <span className="gym-word">{gym.name}</span>
          {gym.location && <span className="gym-loc">{gym.location}</span>}
        </span>
      </span>
    );
  }
  return (
    <span className={`gym-mark gym-chip${onDark ? " on-dark" : ""}${className ? ` ${className}` : ""}`} data-testid="gym-mark">
      {logo}
      <span>
        {label ? `${label} ` : ""}
        <b>{gym.name}</b>
        {gym.location ? ` · ${gym.location}` : ""}
      </span>
    </span>
  );
}
