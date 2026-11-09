// Ported 1:1 from the Racked Artifact prototype's inline icon set.
const PATHS: Record<string, string> = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  trophy:
    '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5a3 3 0 0 0 3 4"/><path d="M16 5h3a3 3 0 0 1-3 4"/><path d="M10 13v3h4v-3"/><path d="M8 20h8"/><path d="M10 16h4v4h-4z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1.3-4 4-6 7-6s5.7 2 7 6"/>',
  dumbbell:
    '<path d="M4 9v6"/><path d="M2.5 10.5v3"/><path d="M7 7v10"/><path d="M17 7v10"/><path d="M19.5 10.5v3"/><path d="M7 12h10"/>',
  flame:
    '<path d="M12 3c1 3-3 4-3 8a3 3 0 0 0 6 0c1.2 1 2 2.6 2 4a5 5 0 0 1-10 0c0-4 3-5 3-9 0-1.2.6-2.3 2-3Z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>',
  bolt: '<path d="M13 3 5 13h5l-1 8 8-11h-5l1-7Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.4-2.1"/>',
  msg: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  camera:
    '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  google:
    '<path d="M21.6 12.23c0-.68-.06-1.36-.18-2H12v3.78h5.4a4.62 4.62 0 0 1-2 3.04v2.5h3.24c1.9-1.75 3-4.32 3-7.32Z" fill="#4285F4"/><path d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.24-2.5c-.9.6-2.05.96-3.4.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.6A10 10 0 0 0 12 22Z" fill="#34A853"/><path d="M6.4 13.9a5.99 5.99 0 0 1 0-3.8V7.5H3.05a10 10 0 0 0 0 9l3.35-2.6Z" fill="#FBBC05"/><path d="M12 5.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.96 9.96 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.35 2.6C7.2 7.74 9.4 5.98 12 5.98Z" fill="#EA4335"/>',
  chartbar: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  medal:
    '<circle cx="12" cy="14" r="6"/><path d="M9.5 8 6.5 2.5M14.5 8l3-5.5M9 14l2 2 4-4"/>',
  wifi: '<path d="M4 9a13 13 0 0 1 16 0"/><path d="M7.2 12.6a8.5 8.5 0 0 1 9.6 0"/><path d="M10.3 16a4 4 0 0 1 3.4 0"/><circle cx="12" cy="19" r="1"/>',
  trash:
    '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
  download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.2 1.6"/><path d="M9.5 3h5"/><path d="M12 3v3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  nfc: '<path d="M7 7.5a6 6 0 0 1 0 9"/><path d="M10.5 5a9.5 9.5 0 0 1 0 14"/><path d="M14 3a12.5 12.5 0 0 1 0 18"/><circle cx="4" cy="12" r="1.2"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-3.5-2.1"/><path d="M2 8.8a15 15 0 0 1 4-2.4M22 8.8A15 15 0 0 0 11 5"/><circle cx="12" cy="20" r="1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20.5V16h-4.5"/>',
  share: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.8"/>',
};

export type IconName = keyof typeof PATHS;

export default function Icon({
  name,
  className,
}: {
  name: IconName | string;
  className?: string;
}) {
  const inner = PATHS[name] || "";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className || "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
