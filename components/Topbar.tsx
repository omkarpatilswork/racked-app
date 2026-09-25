import Link from "next/link";

export function BrandMark() {
  return (
    <div className="brand">
      <span className="dot" />
      RACKED <span className="brand-sub">× BIJLEE</span>
    </div>
  );
}

export default function Topbar({
  right,
  back,
}: {
  right?: React.ReactNode;
  back?: string;
}) {
  return (
    <div className="topbar">
      {back ? (
        <Link href={back} className="iconbtn" aria-label="Back">
          <BackIcon />
        </Link>
      ) : (
        <BrandMark />
      )}
      {right ?? <div style={{ width: 38 }} />}
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
