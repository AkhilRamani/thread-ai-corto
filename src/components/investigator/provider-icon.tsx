export function ProviderIcon({ provider }: { provider: "github" | "notion" }) {
  return provider === "github" ? (
    <svg
      viewBox="0 0 16 16"
      className="size-7 shrink-0"
      role="img"
      aria-label="GitHub"
    >
      <path
        fill="currentColor"
        d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.39v-1.49c-2.23.49-2.7-.95-2.7-.95-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.81.06 1.24.84 1.24.84.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.96 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.7 7.7 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.08-1.87 3.75-3.65 3.95.29.25.54.74.54 1.49v2.18c0 .22.15.47.55.39A8 8 0 0 0 8 0Z"
      />
    </svg>
  ) : (
    <svg
      className="size-7 shrink-0"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Notion"
    >
      <path
        fill="white"
        stroke="currentColor"
        strokeWidth="1.8"
        d="m4 5 20-2 5 4v21L8 30l-4-4z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        d="m4 5 4 4 21-2M8 9v21"
      />
      <text
        x="10"
        y="25"
        fontFamily="Georgia,serif"
        fontWeight="bold"
        fontSize="20"
      >
        N
      </text>
    </svg>
  );
}
