import Link from "next/link";
import Icon from "@/components/Icon";

export function BrandMark() {
  return (
    <Link href="/" className="brand" aria-label="Racked home">
      <span className="dot" />
      RACKED <span className="brand-sub">× BIJLEE</span>
    </Link>
  );
}

export default function Topbar({
  right,
  back,
  title,
}: {
  right?: React.ReactNode;
  back?: string;
  title?: string;
}) {
  return (
    <div className="topbar">
      {back ? (
        <Link href={back} className="iconbtn" aria-label="Back">
          <Icon name="back" />
        </Link>
      ) : (
        <BrandMark />
      )}
      {title && <div className="topbar-title">{title}</div>}
      {right ?? <div style={{ width: 42 }} />}
    </div>
  );
}
