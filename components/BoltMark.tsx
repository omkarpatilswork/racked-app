// The Bijlee Run Club bolt mark (red-orange disc, ink bolt with a yellow
// facet). Same shapes as public/brand/bijlee-bolt.svg. Decorative by
// default; pass `title` when it stands on its own.
export default function BoltMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 1630 1630"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <circle cx="815" cy="815" r="815" fill="#FF482C" />
      <path d="M598 441L1368 439L1200 655L1290 659L1237 812L315 1239L684 775L482 775Z" fill="#202018" />
      <path d="M598 441L232 905L431 905L315 1239L684 775L482 775Z" fill="#F4B424" />
    </svg>
  );
}
