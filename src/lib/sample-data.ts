import type {
  InvestigationResult,
  ProjectSnapshot,
  ImpactResult,
} from "./contracts";
import recording from "./fixtures/recording.json";
// Replaced only by the explicit live evaluation command, never by an anonymous API call.
export const sampleRecording = recording as unknown as {
  label: string;
  recordedAt: string | null;
  snapshot: ProjectSnapshot;
  investigation: InvestigationResult;
  impact: ImpactResult | null;
  question: string;
};
