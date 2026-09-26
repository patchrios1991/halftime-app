// Checks every post in posts.json against X's 280-character limit and writes
// POSTS.md and kit.html. Run from the repo root:  node marketing/x/build.mjs
import { readFileSync, writeFileSync } from "fs";

const raw = readFileSync("marketing/x/posts.json", "utf8");
const { appStoreUrl } = JSON.parse(raw);
// Posts write the App Store link as {appstore}. Until appStoreUrl is set they
// show "[App Store link]", but are length-checked as if a real link were there.
const fill = (url) => JSON.parse(raw.replaceAll("{appstore}", url));
const data = fill(appStoreUrl || "[App Store link]");
const counted = fill(appStoreUrl || "https://apps.apple.com/app/id0000000000");

// X's weighted count: links count as 23, most Latin punctuation as 1,
// everything else (emoji, arrows, CJK) as 2.
export function xLength(text) {
  const light = (cp) => cp <= 4351 || (cp >= 8192 && cp <= 8205) ||
    (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);
  const noLinks = text.replace(/(?:https?:\/\/)?(?:[\w-]+\.)+(?:com|app|io)\b\S*/g, () => "\u0000".repeat(23));
  let n = 0;
  for (const ch of noLinks.replace(/️/g, "")) n += light(ch.codePointAt(0)) ? 1 : 2;
  return n;
}

const posts = (d) => [...d.launch.posts, d.pinned, ...d.thread.posts, ...d.pillars.flatMap((p) => p.posts), ...d.replies.posts];
const lengths = new Map(posts(data).map((p, i) => [p, xLength(posts(counted)[i].text)]));
const all = [...data.launch.posts, data.pinned, ...data.thread.posts, ...data.pillars.flatMap((p) => p.posts), ...data.replies.posts];
const over = all.filter((p) => lengths.get(p) > 280);
if (over.length) {
  over.forEach((p) => console.error(`${lengths.get(p)} chars: ${p.text.slice(0, 60)}…`));
  process.exit(1);
}
const polls = all.filter((p) => p.poll?.some((o) => o.length > 25));
if (polls.length) { console.error("Poll option over 25 chars"); process.exit(1); }

if (!appStoreUrl) console.warn("appStoreUrl not set in posts.json; posts show [App Store link]");
const byId = Object.fromEntries(all.filter((p) => p.id).map((p) => [p.id, p]));
const block = (p) => [
  "```", p.text, "```",
  p.poll ? `Poll options: ${p.poll.map((o) => `**${o}**`).join(" · ")}` : "",
  p.image ? `Image: \`images/${p.image}\`` : "",
  `<sub>${lengths.get(p)}/280</sub>`, "",
].filter(Boolean).join("\n") + "\n";

let md = `# HalfTime on X: launch kit

Generated from \`posts.json\` by \`node marketing/x/build.mjs\`. Edit the JSON, not this file.
Images are 1600×900 (shows uncropped in the X timeline). Re-render them with
\`node marketing/x/render-cards.mjs\`.

## Profile

| Field | Value |
|---|---|
| Name | ${data.profile.name} |
| Bio | ${data.profile.bio} (${xLength(data.profile.bio)}/160) |
| Location | ${data.profile.location} |
| Website | ${data.profile.website} |
| Avatar | \`images/avatar.png\` |
| Header | \`images/header-1500x500.png\` |

## ${data.launch.title}

${data.launch.why}

${data.launch.posts.map(block).join("\n")}
## Pinned post

${block(data.pinned)}
## ${data.thread.title}

${data.thread.note}

${data.thread.posts.map((p, i) => `**${i + 1}/${data.thread.posts.length}**\n\n${block(p)}`).join("\n")}
`;

for (const pillar of data.pillars) {
  md += `\n## ${pillar.title}\n\n${pillar.why}\n\n${pillar.posts.map(block).join("\n")}`;
}
md += `\n## ${data.replies.title}\n\n${data.replies.why}\n\n${data.replies.posts.map(block).join("\n")}`;
md += `\n## Two-week schedule\n\n| Day | Post |\n|---|---|\n${data.schedule.map((d) =>
  `| ${d.day} | ${d.items.map((id) => id === "pinned" ? "Pinned post" : id === "launch-thread" ? "Launch thread" :
    byId[id] ? `\`${id}\`: ${byId[id].text.split("\n")[0]}` : id).join("<br>")} |`).join("\n")}\n`;

writeFileSync("marketing/x/POSTS.md", md);

// kit.html: the copy-and-post page, with posts.json and the checked lengths inlined.
for (const [p, n] of lengths) p.len = n;
const tpl = readFileSync("marketing/x/kit.template.html", "utf8");
writeFileSync("marketing/x/kit.html", tpl.replace("/*POSTS_JSON*/null", JSON.stringify(data).replace(/</g, "\\u003c")));
console.log(`ok: ${all.length} posts, longest ${Math.max(...lengths.values())}/280, bio ${xLength(data.profile.bio)}/160`);
