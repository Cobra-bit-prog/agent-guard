import { useState } from "react";

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    /* fall through */
  }
  return window.prompt("Copy this", value) !== null;
}

export function CopyCode({
  code,
  label = "Copy",
}: {
  code: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative">
      <pre className="mt-2 overflow-x-auto rounded-[16px] bg-[#12263f] p-4 pr-20 font-mono text-meta leading-relaxed text-[#e8eef6]">
        {code}
      </pre>
      <button
        type="button"
        className="absolute right-3 top-3 rounded-full border border-[#3a4d63] bg-[#1a314d] px-2.5 py-1 text-meta font-medium text-[#e8eef6] hover:border-coral hover:text-white"
        onClick={() => {
          void copyText(code).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
