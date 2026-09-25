import Link from "next/link";
import Icon from "@/components/Icon";

export default function NotFound() {
  return (
    <div className="stack-lg center" style={{ paddingTop: "20vh" }}>
      <div style={{ color: "var(--ink-faint)" }}>
        <Icon name="target" />
      </div>
      <h1 style={{ fontSize: 24, margin: "10px 0 2px" }}>Not found</h1>
      <p className="muted" style={{ margin: "0 0 16px" }}>That machine or page doesn&rsquo;t exist.</p>
      <Link href="/" className="btn btn-yellow" style={{ maxWidth: 200, margin: "0 auto" }}>
        Back home
      </Link>
    </div>
  );
}
