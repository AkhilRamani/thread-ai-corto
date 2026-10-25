import type { ReactNode, Ref } from "react";

export function PageShell({
  header,
  eyebrow,
  title,
  headingRef,
  children,
}: {
  header: ReactNode;
  eyebrow: ReactNode;
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <>
      <a
        className="fixed top-[-100px] left-4 z-20 rounded-3xl bg-black px-5 py-3 text-white focus:top-3"
        href="#main"
      >
        Skip to content
      </a>
      {header}
      <main
        className="mx-auto w-full max-w-[904px] px-[22px] pt-12 pb-10 max-[600px]:px-5 max-[600px]:pb-8"
        id="main"
      >
        <div className="mb-8">
          <p className="mb-8 flex items-center gap-2.5 font-mono text-[12px] leading-[18px] font-normal tracking-normal text-muted-foreground uppercase max-[600px]:mb-6 max-[600px]:gap-2 max-[600px]:text-[10px]">
            {eyebrow}
          </p>
          <h1
            className="scroll-mt-8 text-[clamp(30px,3.1vw,40px)] leading-[1.2] tracking-[-0.03em] text-balance focus:not-focus-visible:outline-none max-[600px]:text-[32px]"
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
          >
            {title}
          </h1>
        </div>
        {children}
      </main>
    </>
  );
}
