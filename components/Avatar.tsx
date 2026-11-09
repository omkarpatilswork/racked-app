// Round avatar: Google photo if there is one, otherwise the first letter.
export default function Avatar({
  name,
  url,
  size = 36,
  className = "",
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const letter = (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" />
      ) : (
        letter
      )}
    </span>
  );
}
