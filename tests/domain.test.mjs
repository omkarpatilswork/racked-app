// The real-domain switch in next.config.mjs (www.racked.site, Nov 2026).
// Run: node tests/domain.test.mjs
let n = 0, bad = 0;
const check = (name, ok, extra = "") => { n++; if (!ok) bad++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
let i = 0;
async function redirectsWith(env) {
  for (const k of ["VERCEL_ENV", "NEXT_PUBLIC_SITE_URL"]) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import(new URL(`../next.config.mjs?case=${i++}`, import.meta.url).href);
  return mod.default.redirects();
}
const hostRule = (list) => list.find((r) => r.has && r.has[0].type === "host");
const matches = (rule, host) => new RegExp(`^${rule.has[0].value}$`).test(host);

const prod = await redirectsWith({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://www.racked.site/" });
const rule = hostRule(prod);
check("live site + domain set: every vercel.app address goes to www.racked.site", !!rule && rule.destination === "https://www.racked.site/:path*" && rule.source === "/:path*", JSON.stringify(prod));
check("permanent (308) so the stickers' old links move over for good", rule && rule.permanent === true);
check("it comes first (before the short links)", prod[0] === rule);
check("matches the old live address and deployment addresses", rule && matches(rule, "racked-app-liard.vercel.app") && matches(rule, "racked-nbm3c5m78-omjamdade7-8264s-projects.vercel.app"));
check("never matches the real domain itself (no loop)", rule && !matches(rule, "www.racked.site") && !matches(rule, "racked.site"));
check("no domain set: no redirect", !hostRule(await redirectsWith({ VERCEL_ENV: "production" })));
check("preview builds: no redirect", !hostRule(await redirectsWith({ VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://www.racked.site" })));
check("local runs: no redirect", !hostRule(await redirectsWith({ NEXT_PUBLIC_SITE_URL: "https://www.racked.site" })));
check("a vercel.app address as the 'domain' never redirects to itself", !hostRule(await redirectsWith({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://racked-app-liard.vercel.app" })));
check("http:// or a typo: no redirect", !hostRule(await redirectsWith({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://www.racked.site" })) && !hostRule(await redirectsWith({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "www.racked.site" })));
const short = await redirectsWith({});
check("short links: /staff -> /admin, /rr -> /rnr", short.some((r) => r.source === "/staff" && r.destination === "/admin") && short.some((r) => r.source === "/rr" && r.destination === "/rnr"));
console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
