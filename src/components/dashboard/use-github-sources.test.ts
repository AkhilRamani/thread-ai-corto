import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGitHubSources } from "./use-github-sources";

const snapshot = {
  items: [{ id: "real-source" }],
  fetchedAt: "2026-10-25T00:00:00Z",
  coverage: "complete",
};
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("clears old data on refresh, discards stale requests, and never substitutes a sample", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ snapshot }));
  const { result, unmount } = renderHook(() => useGitHubSources());
  await waitFor(() =>
    expect(result.current.state.snapshot.items).toHaveLength(1),
  );
  let finishOld!: (value: Response) => void;
  fetchMock
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ snapshot: { ...snapshot, items: [] } }),
    );
  act(() => {
    void result.current.refresh();
  });
  expect(result.current.state.snapshot.items).toHaveLength(0);
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    finishOld(Response.json({ snapshot }));
  });
  expect(result.current.state.snapshot.items).toHaveLength(0);
  expect(result.current.state.loading).toBe(false);
  unmount();
});

it("clears visible data and offers reconnection after a revoked session", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockResolvedValueOnce(
      Response.json(
        { error: "unauthorized", message: "Reconnect GitHub." },
        { status: 401 },
      ),
    );
  const { result, unmount } = renderHook(() => useGitHubSources());
  await waitFor(() =>
    expect(result.current.state.snapshot.items).toHaveLength(1),
  );
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.state).toMatchObject({
    expired: true,
    error: "Reconnect GitHub.",
    snapshot: { items: [] },
  });
  unmount();
});

it("aborts pending work when leaving the live dashboard", () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const { unmount } = renderHook(() => useGitHubSources());
  const signal = fetchMock.mock.calls[0][1]!.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
});

it.each(["failure", "partial"])(
  "honours the retry delay after a %s without automatic retries",
  async (kind) => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        kind === "failure"
          ? Response.json(
              {
                error: "rate-limited",
                message: "Wait before refreshing.",
                retryAfter: 120,
              },
              { status: 429 },
            )
          : Response.json({
              snapshot: { ...snapshot, coverage: "partial", retryAfter: 120 },
            }),
      )
      .mockResolvedValueOnce(Response.json({ snapshot }));
    const { result, unmount } = renderHook(() => useGitHubSources());
    await act(async () => {});
    expect(result.current.state.retryAt).toBe(Date.now() + 120_000);
    expect(result.current.state.snapshot.items).toHaveLength(
      kind === "partial" ? 1 : 0,
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(119_000);
    });
    expect(result.current.state.retryAt).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.state.retryAt).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.state.error).toBeNull();
    unmount();
  },
);

it("rechecks a restored page's session even during a cooldown", async () => {
  fetchMock
    .mockResolvedValueOnce(
      Response.json({
        snapshot: { ...snapshot, coverage: "partial", retryAfter: 120 },
      }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: "unauthorized", message: "Reconnect GitHub." },
        { status: 401 },
      ),
    );
  const { result, unmount } = renderHook(() => useGitHubSources());
  await waitFor(() => expect(result.current.state.retryAt).not.toBeNull());
  await act(async () => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  expect(result.current.state.expired).toBe(true);
  expect(result.current.state.snapshot.items).toHaveLength(0);
  expect(result.current.state.retryAt).toBeNull();
  unmount();
});
