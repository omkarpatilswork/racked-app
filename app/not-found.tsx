import Link from "next/link";
import Icon from "@/components/Icon";

export default function NotFound() {
  return (
    <div className="page stack-lg center" style={{ paddingTop: "18vh" }}>
      <div className="tapin-icons" style={{ margin: "0 auto", width: 60, height: 60, borderRadius: 20 }}>
        <Icon name="target" />
      </div>
      <h1 style={{ fontSize: 24, margin: 0 }}>Nothing here</h1>
      <p className="muted" style={{ margin: 0 }}>That machine or page doesn&rsquo;t exist. If you scanned a sticker, tell the front desk.</p>
      <Link href="/" className="btn btn-yellow" style={{ maxWidth: 240, margin: "8px auto 0" }}>
        Back home
      </Link>
    </div>
  );
}
