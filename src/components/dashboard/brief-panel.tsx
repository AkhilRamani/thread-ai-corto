import Image from "next/image";
import wave from "../../../public/images/brief-wave.webp";
import { type SourceItem, type WorkBrief } from "@/lib/contracts";

import { SourceReferences } from "./source-references";

type BriefPanelProps = {
  brief: WorkBrief;
  sources: SourceItem[];
  onSourceSelect: (id: string) => void;
};

export function BriefPanel({
  brief,
  sources,
  onSourceSelect,
}: BriefPanelProps) {
  return (
    <section
      className="relative isolate grid min-h-[380px] items-center overflow-hidden rounded-panel bg-[#5259dc] px-10 pt-[120px] pb-[72px] text-white max-[600px]:min-h-[360px] max-[600px]:px-6 max-[600px]:py-16"
      aria-label="Your work brief"
    >
      <Image
        className="-z-2 object-cover max-[600px]:object-fill"
        src={wave}
        alt=""
        fill
        priority
        sizes="(max-width: 904px) 100vw, 860px"
      />
      <div
        className="absolute inset-0 -z-1 bg-brief-scrim"
        aria-hidden="true"
      />
      <div className="mx-auto w-full max-w-[560px] text-center">
        <p className="text-[22px] leading-8 tracking-[-0.02em] text-pretty max-[600px]:text-[18px] max-[600px]:leading-7">
          {brief.overview}
        </p>
        <SourceReferences
          sourceIds={brief.sourceIds}
          sources={sources}
          onSourceSelect={onSourceSelect}
          variant="panel"
          label="Sources for this brief"
        />
      </div>
    </section>
  );
}
