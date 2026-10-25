import { sampleScenarios, type SampleScenario } from "./use-sample-dashboard";
import Link from "next/link";

export function SampleControls({
  value,
  onChange,
}: {
  value: SampleScenario;
  onChange: (value: SampleScenario) => void;
}) {
  return (
    <footer
      className="mt-24 border-t pt-8 text-[14px] max-[600px]:mt-16"
      id="about-sample"
      tabIndex={-1}
    >
      <p>This is a sample workspace.</p>
      <p className="mt-2 max-w-[540px] text-muted-foreground">
        The activity is illustrative and the brief is prerecorded. This sample
        does not use your GitHub data or make AI requests.
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex items-center gap-2 underline underline-offset-4"
      >
        Connect your GitHub account
      </Link>
      <details className="mt-5">
        <summary className="min-h-11 w-fit py-2.5 text-muted-foreground">
          Explore sample states
        </summary>
        <div className="grid max-w-[400px] gap-3 pt-4">
          <label className="font-medium" htmlFor="sample-scenario">
            Preview a different situation
          </label>
          <select
            className="min-h-11 appearance-auto rounded-lg border bg-muted px-3 py-2 text-foreground"
            id="sample-scenario"
            value={value}
            onChange={(event) => onChange(event.target.value as SampleScenario)}
          >
            {sampleScenarios.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-[13px] text-muted-foreground">
            Actions simulate a short wait. Retrying an error restores the
            sample.
          </p>
        </div>
      </details>
    </footer>
  );
}
