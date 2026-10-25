import { sampleScenarios, type SampleScenario } from "./use-sample-dashboard";

export function SampleControls({
  value,
  onChange,
}: {
  value: SampleScenario;
  onChange: (value: SampleScenario) => void;
}) {
  return (
    <footer className="sample-footer" id="about-sample" tabIndex={-1}>
      <p>This is a sample workspace.</p>
      <p className="sample-explanation">
        The activity is illustrative and the brief is prerecorded. No GitHub
        account is connected and no AI request is made.
      </p>
      <details className="sample-controls">
        <summary>Explore sample states</summary>
        <div className="scenario-picker">
          <label htmlFor="sample-scenario">Preview a different situation</label>
          <select
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
          <p>
            Actions simulate a short wait. Retrying an error restores the
            sample.
          </p>
        </div>
      </details>
    </footer>
  );
}
