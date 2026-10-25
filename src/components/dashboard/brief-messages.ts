// Each state has one title and explanation, shared by visible and live-region feedback.
export const briefMessages = {
  generating: {
    title: "Finding the thread…",
    description: "Connecting the activity into a short, source-backed brief.",
  },
  loading: {
    title: "Gathering your sources…",
    description:
      "Your brief will be ready to generate once the source list is loaded.",
  },
  expired: {
    title: "Your GitHub connection has expired.",
    description:
      "Reconnect to continue. Your previous sources have been cleared.",
  },
  sourceError: {
    title: "Your work will be here when GitHub returns.",
    description: "Retry the source request below to continue.",
  },
  partialEmpty: {
    title: "The search is incomplete.",
    description:
      "Some collections could not be retrieved. Retry the sources below before drawing conclusions.",
  },
  empty: {
    title: "No matching public activity.",
    description:
      "There is no matching activity in this snapshot. Private repositories are not included.",
  },
  briefError: {
    title: "The brief couldn’t be generated.",
    description: "Your sources are still here. Try again when you’re ready.",
  },
  unconfigured: {
    title: "Brief generation is not configured.",
    description:
      "You can still explore your GitHub sources below or view the sample brief.",
  },
  ready: {
    title: "Your sources are ready to explore.",
    description:
      "Turn the sources below into a short overview and a useful starting point.",
  },
};
