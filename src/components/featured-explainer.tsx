import { useEffect, useRef, useState } from "react";

/**
 * Files under public/video. The webm is listed first; the mp4 is the fallback.
 * Bump ?v= when the files change so browsers do not keep an old cut.
 */
export const FEATURED_EXPLAINER = {
  webm: "/video/featured-explainer.webm?v=2",
  mp4: "/video/featured-explainer.mp4?v=2",
  poster: "/video/featured-explainer-poster.webp?v=2",
  label: "Short clip: how featuring your agent works",
} as const;

/**
 * 13-second muted clip above the Get featured form on /directory.
 * preload="none" and no autoplay attribute: it plays only while in view, and
 * never when the visitor asks for reduced motion (they see the poster).
 */
export function FeaturedExplainer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    if (reducedMotion) {
      video.pause();
      return;
    }
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <figure className="featured-explainer mt-10 max-w-[40rem]">
      <video
        ref={videoRef}
        className="featured-explainer-video"
        aria-label={FEATURED_EXPLAINER.label}
        poster={FEATURED_EXPLAINER.poster}
        width={1280}
        height={720}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
      >
        <source src={FEATURED_EXPLAINER.webm} type="video/webm" />
        <source src={FEATURED_EXPLAINER.mp4} type="video/mp4" />
      </video>
      <figcaption className="sr-only">{FEATURED_EXPLAINER.label}</figcaption>
    </figure>
  );
}
