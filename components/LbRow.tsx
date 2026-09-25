const MEDALS = ["🥇", "🥈", "🥉"];

export default function LbRow({
  rank,
  name,
  avatarUrl,
  best,
  isMe,
}: {
  rank: number;
  name: string;
  avatarUrl?: string | null;
  best: string;
  isMe?: boolean;
}) {
  return (
    <div className={`lb-row${isMe ? " me" : ""}`}>
      <div className="rank">{rank <= 3 ? MEDALS[rank - 1] : rank}</div>
      <div className="avatar">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          (name || "?").slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="name">{isMe ? "You" : name}</div>
      <div className="best num">{best}</div>
    </div>
  );
}
