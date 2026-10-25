import Image from "next/image";
import wave from "../../../public/images/brief-wave.webp";
import { sourceLabel, type SourceItem, type WorkBrief } from "@/lib/contracts";

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
  const references = sources.filter((source) =>
    brief.sourceIds.includes(source.id),
  );
  return (
    <section className="brief-panel" aria-label="Your work brief">
      <Image
        className="brief-wave"
        src={wave}
        alt=""
        fill
        priority
        sizes="(max-width: 904px) 100vw, 860px"
      />
      <div className="brief-scrim" aria-hidden="true" />
      <div className="brief-content">
        <p className="brief-overview">{brief.overview}</p>
        <div className="brief-references" aria-label="Sources for this brief">
          {references.map((source) => (
            <button
              className="citation"
              key={source.id}
              onClick={() => onSourceSelect(source.id)}
              aria-label={`View source ${sourceLabel(source)}`}
            >
              {sourceLabel(source)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
