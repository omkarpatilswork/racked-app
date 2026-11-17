import type { TvBoard, TvData } from "@/lib/data";

export type Slide =
  | { kind: "join"; key: string }
  | { kind: "totals"; key: string }
  | { kind: "groups"; key: string }
  | { kind: "open"; key: string }
  | { kind: "prizes"; key: string }
  | { kind: "board"; key: string; board: TvBoard };

// Join and totals first, then the leaderboards in groups of three, with the
// "who's hitting what" slide and the join slide coming back in between so a
// newcomer never waits long to see the QR code.
// With a live prize race (0011 rewards), a "this week's prizes" slide follows
// the totals.
export function buildSlides(data: TvData, hasPrizes = false): Slide[] {
  const boards = data.boards.filter((b) => b.entries.length > 0);
  // Nothing logged yet today: skip the "0 kg" and empty-bar slides and just
  // alternate the invite with "every board is wide open".
  if (boards.length === 0 && data.activity.sets === 0) {
    return [
      { kind: "join", key: "join-1" },
      ...(hasPrizes ? [{ kind: "prizes", key: "prizes" } as Slide] : []),
      { kind: "open", key: "open" },
    ];
  }
  const slides: Slide[] = [
    { kind: "join", key: "join-1" },
    { kind: "totals", key: "totals" },
  ];
  if (hasPrizes) slides.push({ kind: "prizes", key: "prizes" });
  if (boards.length === 0) {
    slides.push({ kind: "open", key: "open" }, { kind: "groups", key: "groups" });
    return slides;
  }
  let extras = 0;
  boards.forEach((b, i) => {
    slides.push({ kind: "board", key: b.key, board: b });
    if ((i + 1) % 3 === 0 && i < boards.length - 1) {
      // every key is unique: the show tracks its place by key
      slides.push(extras % 2 === 0 ? { kind: "groups", key: `groups-${extras}` } : { kind: "join", key: `join-${extras + 2}` });
      extras++;
    }
  });
  if (!slides.some((s) => s.kind === "groups")) slides.push({ kind: "groups", key: "groups-end" });
  return slides;
}

