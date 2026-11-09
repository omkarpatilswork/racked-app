import Avatar from "@/components/Avatar";

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
      <div className="rank" aria-label={`Rank ${rank}`}>
        {rank <= 3 ? MEDALS[rank - 1] : rank}
      </div>
      <Avatar name={name} url={avatarUrl} />
      <div className="name">{isMe ? "You" : name}</div>
      <div className="best num">{best}</div>
    </div>
  );
}
