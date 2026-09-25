export default function StatGrid({
  stats,
}: {
  stats: { v: string | number; l: string }[];
}) {
  return (
    <div className="stat-grid">
      {stats.map((s, i) => (
        <div className="stat-tile" key={i}>
          <div className="v">{s.v}</div>
          <div className="l">{s.l}</div>
        </div>
      ))}
    </div>
  );
}
