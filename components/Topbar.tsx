import Link from "next/link";
import Icon from "@/components/Icon";
import BoltMark from "@/components/BoltMark";

// Racked × Bijlee lockup: the Bijlee Run Club bolt + RACKED wordmark.
export function BrandMark({ href = "/home" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="Racked home">
      <BoltMark className="brand-bolt" />
      <span className="brand-word">RACKED</span>
      <span className="brand-sub">× BIJLEE</span>
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
