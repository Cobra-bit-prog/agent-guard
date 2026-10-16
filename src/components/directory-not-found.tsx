import { SkyShell } from "@/components/marketing/chrome";

/** Plain not-found page for an unknown or hidden listing. The route answers 404. */
export function DirectoryNotFound() {
  return (
    <SkyShell>
      <main className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-4 md:px-6">
        <h1 className="mt-8 text-title font-semibold text-fg">This agent is not on the list.</h1>
        <p className="mt-4 text-body text-muted">
          <a href="/directory" className="underline hover:text-fg">
            All agents
          </a>
        </p>
      </main>
    </SkyShell>
  );
}
