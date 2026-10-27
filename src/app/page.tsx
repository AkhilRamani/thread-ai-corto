import { PageShell } from "@/components/dashboard/page-shell";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/dashboard/site-header";
import { getAuthConfig } from "@/lib/server/config";
import { getSignedInUser } from "@/lib/server/session";

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
    <PageShell
      header={<SiteHeader user={user ?? undefined} mode="entry" />}
      eyebrow="Your work, with context"
      title="Pick up your work. Check it against the plan."
    >
      <p className="max-w-[560px] text-[18px] leading-7 text-muted-foreground">
        Sign in with GitHub for a brief on your pull requests and assigned
        issues. Add Notion when you want to see where project plans and GitHub
        work disagree.
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
          GitHub sign-in is not configured here yet. The sample is available to
          explore.
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
          <Link href="/sample">Explore an example</Link>
        </Button>
      </div>
      <p className="mt-5 max-w-[560px] text-[14px] text-muted-foreground">
        GitHub sign-in also connects your public GitHub work. Notion is
        optional. Connections are read-only. Selected content is sent to OpenAI
        only when you generate a brief or run a plan check.
      </p>
      <section
        className="mt-16 relative isolate grid min-h-[380px] items-center overflow-hidden rounded-panel bg-[#5259dc] px-10 pt-[120px] pb-[72px] text-white max-[600px]:min-h-[360px] max-[600px]:px-6 max-[600px]:py-16"
        aria-label="Illustrative example finding"
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
            Example finding · Synthetic data
          </p>
          <p className="text-[22px] leading-8 tracking-[-0.02em] text-pretty max-[600px]:text-[18px] max-[600px]:leading-7">
            The resend action has two different plans.
          </p>
          <p className="mt-4 text-[16px] leading-7">
            The specification requires resend in the first release. The PR
            discussion defers it, while the release checklist still includes it.
          </p>
        </div>
      </section>
      <p className="mt-6 max-w-[650px] text-[15px] leading-7 text-muted-foreground">
        A source-backed finding makes the consequence clear: agree the release
        scope before treating the work as complete. Open exact passages, check
        counterevidence, then explore what a requirement change could affect.
      </p>

      <div className="h-24" />
    </PageShell>
  );
}
