import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const COMPONENT = read("src/components/featured-explainer.tsx");
const DIRECTORY = read("src/routes/directory.tsx");

function videoTag(): string {
  const start = COMPONENT.indexOf("<video");
  const end = COMPONENT.indexOf("</video>");
  assert.ok(start > 0 && end > start, "component renders one <video>");
  return COMPONENT.slice(start, end);
}

describe("featured explainer clip", () => {
  it("is muted, looping, inline, poster-first, and loads nothing until played", () => {
    const tag = videoTag();
    assert.match(tag, /\n\s+muted\n/);
    assert.match(tag, /\n\s+loop\n/);
    assert.match(tag, /\n\s+playsInline\n/);
    assert.match(tag, /preload="none"/);
    assert.match(tag, /poster=\{FEATURED_EXPLAINER\.poster\}/);
    assert.match(tag, /aria-label=\{FEATURED_EXPLAINER\.label\}/);
    assert.doesNotMatch(tag, /\bcontrols\b/);
    assert.doesNotMatch(tag, /autoPlay|autoplay/);
    assert.match(COMPONENT, /label: "Short clip: how featuring your agent works"/);
    assert.match(
      COMPONENT,
      /<figcaption className="sr-only">\{FEATURED_EXPLAINER\.label\}<\/figcaption>/,
    );
  });

  it("lists the webm first and the mp4 as the fallback", () => {
    const tag = videoTag();
    const webm = tag.indexOf('type="video/webm"');
    const mp4 = tag.indexOf('type="video/mp4"');
    assert.ok(webm > 0 && mp4 > webm);
    assert.match(COMPONENT, /webm: "\/video\/featured-explainer\.webm"/);
    assert.match(COMPONENT, /mp4: "\/video\/featured-explainer\.mp4"/);
    assert.match(COMPONENT, /poster: "\/video\/featured-explainer-poster\.webp"/);
  });

  it("plays only in view and never with reduced motion", () => {
    assert.match(COMPONENT, /new IntersectionObserver\(/);
    assert.match(COMPONENT, /entry\.isIntersecting/);
    assert.match(COMPONENT, /video\.pause\(\)/);
    assert.match(COMPONENT, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
    // Reduced motion is assumed until the browser says otherwise, so SSR and
    // the first paint never start playback.
    assert.match(COMPONENT, /useState\(true\)/);
    assert.match(COMPONENT, /if \(reducedMotion\) \{\s*video\.pause\(\);\s*return;\s*\}/);
  });

  it("reserves 16:9 with the card corner and stays narrow on desktop", () => {
    const css = read("src/styles.css");
    const rule = css.slice(css.indexOf(".featured-explainer-video {"));
    assert.match(rule, /aspect-ratio: 16 \/ 9;/);
    assert.match(rule, /width: 100%;/);
    assert.match(rule, /border-radius: 1\.4rem;/);
    assert.match(COMPONENT, /width=\{1280\}\s+height=\{720\}/);
    assert.match(COMPONENT, /max-w-\[40rem\]/);
    assert.doesNotMatch(COMPONENT, /text-\[\d+px\]/);
  });

  it("sits right above the Get featured form and leaves the CTA copy alone", () => {
    assert.match(DIRECTORY, /<FeaturedExplainer \/>\s*<DirectoryFeatured\b/);
    assert.equal(DIRECTORY.match(/<FeaturedExplainer \/>/g)?.length, 1);
    assert.match(DIRECTORY, /Feature a listing \(\$19 \/ 7 days\)/);
    assert.match(
      DIRECTORY,
      /<p className="feature-banner-note">\$19 USDC\. Your listing stays free\.<\/p>/,
    );
    assert.doesNotMatch(DIRECTORY, /text-\[\d+px\]/);
  });

  it("keeps the homepage free of the clip", () => {
    const home = read("src/routes/index.tsx");
    assert.doesNotMatch(home, /featured-explainer|FeaturedExplainer|<video/);
  });

  it("ships small files", () => {
    const size = (rel: string) => statSync(join(ROOT, "public/video", rel)).size;
    assert.ok(size("featured-explainer.webm") < 800_000);
    assert.ok(size("featured-explainer.mp4") < 1_050_000);
    assert.ok(size("featured-explainer-poster.webp") < 80_000);
  });
});
