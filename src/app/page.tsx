import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/dashboard/site-header";
import { getAuthConfig } from "@/lib/server/config";
import { getSignedInUser } from "@/lib/server/session";
import { sampleBrief } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

const authMessages: Record<string, string> = {
  "not-configured":
    "GitHub sign-in is not configured for this environment. You can explore the sample.",
  "invalid-state":
    "This sign-in attempt expired or was opened in a different browser. Please start again.",
  cancelled:
    "GitHub sign-in was cancelled. You can try again whenever you’re ready.",
  failed: "GitHub sign-in could not be completed. Please try again.",
  expired: "Your session has expired. Reconnect to load your GitHub work.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>;
}) {
  const { auth } = await searchParams;
  const user = await getSignedInUser();
  const message =
    typeof auth === "string" && Object.hasOwn(authMessages, auth)
      ? authMessages[auth]
      : undefined;
  if (user && !message) redirect("/dashboard");
  const configured = !!getAuthConfig();
  return (
    <>
      <a
        className="fixed top-[-100px] left-4 z-10 rounded-3xl bg-black px-5 py-3 text-white focus:top-3"
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader user={user ?? undefined} mode="entry" />
      <main
        className="mx-auto w-full max-w-[904px] px-[22px] pt-12 pb-10 max-[600px]:px-5 max-[600px]:pb-8"
        id="main"
      >
        <div className="mb-8">
          <p className="mb-8 flex items-center gap-2.5 font-mono text-[12px] leading-[18px] font-normal tracking-normal text-muted-foreground uppercase max-[600px]:mb-6 max-[600px]:gap-2 max-[600px]:text-[10px]">
            Your work, back in context
          </p>
          <h1 className="scroll-mt-8 text-[clamp(30px,3.1vw,40px)] leading-[1.2] tracking-[-0.03em] text-balance focus:not-focus-visible:outline-none max-[600px]:text-[32px]">
            Pick up where you left off.
          </h1>
        </div>
        <p className="max-w-[560px] text-[18px] leading-7 text-muted-foreground">
          Bring your recent pull requests and open threads together. Find your
          way back into the work.
        </p>
        {message && (
          <p
            className="mt-6 border-l-2 border-[#777] bg-muted px-5 py-4 text-[14px]"
            role="alert"
          >
            {message}
          </p>
        )}
        {!configured && !message && (
          <p className="mt-6 border-l-2 border-[#777] bg-muted px-5 py-4 text-[14px]">
            GitHub sign-in is not configured here yet. The sample is available
            to explore.
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3 max-[600px]:items-start">
          <Button asChild={configured} disabled={!configured}>
            {configured ? (
              <a href="/api/auth/github">Continue with GitHub</a>
            ) : (
              "Continue with GitHub"
            )}
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/sample">Explore sample</Link>
          </Button>
        </div>
        <p className="mt-5 max-w-[560px] text-[14px] text-muted-foreground">
          Public pull requests and assigned issues only. We do not request
          access to private repositories or modify your GitHub work.
        </p>
        <section
          className="mt-16 relative isolate grid min-h-[380px] items-center overflow-hidden rounded-panel bg-[#5259dc] px-10 pt-[120px] pb-[72px] text-white max-[600px]:min-h-[360px] max-[600px]:px-6 max-[600px]:py-16"
          aria-label="Illustrative sample brief"
        >
          <Image
            src="/images/brief-wave.webp"
            alt=""
            fill
            className="-z-2 object-cover max-[600px]:object-fill"
            sizes="(max-width: 904px) 100vw, 860px"
            priority
          />
          <div className="absolute inset-0 -z-1 bg-brief-scrim" />
          <div className="mx-auto w-full max-w-[560px] text-center">
            <p className="mb-6 font-mono text-[12px] leading-[18px] font-normal uppercase">
              Illustrative sample
            </p>
            <p className="text-[22px] leading-8 tracking-[-0.02em] text-pretty max-[600px]:text-[18px] max-[600px]:leading-7">
              {sampleBrief.overview}
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
