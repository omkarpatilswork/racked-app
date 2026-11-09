import { safeNext } from "../lib/safeNext";
const cases: [string | null, string][] = [
  [null, "/"], ["", "/"], ["/", "/"], ["/machine/lat-pulldown-01?tap=LP4K9X", "/machine/lat-pulldown-01?tap=LP4K9X"],
  ["/leaderboard?tab=machines#x", "/leaderboard?tab=machines#x"], ["//evil.com", "/"], ["/\t/evil.com", "/"], ["/\n/evil.com", "/"],
  ["/\\evil.com", "/"], ["https://evil.com", "/"], ["@evil.com", "/"], ["evil.com", "/"], ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ["/ /evil.com", "/%20/evil.com"], ["javascript:alert(1)", "/"],
];
let bad = 0;
for (const [i, want] of cases) { const got = safeNext(i); if (got !== want) { bad++; console.log("FAIL", JSON.stringify(i), got, "want", want); } }
console.log(`${cases.length - bad}/${cases.length} safeNext cases passed`);
process.exit(bad ? 1 : 0);
