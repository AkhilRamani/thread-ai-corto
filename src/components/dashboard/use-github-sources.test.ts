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

const brief = {
  title: "A work thread",
  overview: "Useful source-backed context.",
  sourceIds: ["real-source"],
  observations: [],
  nextStep: null,
};

it("generates only on demand and atomically replaces the snapshot and brief", async () => {
  const fresh = {
    ...snapshot,
    fetchedAt: "2026-10-25T01:00:00Z",
    items: [{ id: "fresh-source" }],
  };
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockResolvedValueOnce(
      Response.json({
        snapshot: fresh,
        brief: { ...brief, sourceIds: ["fresh-source"] },
      }),
    );
  const { result, unmount } = renderHook(() => useGitHubSources());
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.state.brief).toBeNull();
  await act(async () => {
    await result.current.generate();
  });
  expect(fetchMock.mock.calls[1][0]).toBe("/api/brief");
  expect(fetchMock.mock.calls[1][1]?.body).toBeUndefined();
  expect(result.current.state.snapshot).toEqual(fresh);
  expect(result.current.state.brief?.sourceIds).toEqual(["fresh-source"]);
  unmount();
});

it("deduplicates generation clicks and discards a generation superseded by refresh", async () => {
  let finish!: (response: Response) => void;
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ snapshot: { ...snapshot, items: [] } }),
    );
  const { result, unmount } = renderHook(() => useGitHubSources());
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  act(() => {
    void result.current.generate();
    void result.current.generate();
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.state.generating).toBe(true);
  await act(async () => {
    await result.current.refresh();
  });
  expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
  await act(async () => {
    finish(Response.json({ snapshot, brief }));
  });
  expect(result.current.state.brief).toBeNull();
  expect(result.current.state.snapshot.items).toHaveLength(0);
  unmount();
});

it.each([false, true])(
  "keeps usable sources on AI failure, using fresh sources when available (%s)",
  async (fresh) => {
    const updated = { ...snapshot, fetchedAt: "2026-10-25T01:00:00Z" };
    fetchMock
      .mockResolvedValueOnce(Response.json({ snapshot }))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: "unavailable",
            stage: "brief",
            message: "Try again.",
            ...(fresh ? { snapshot: updated } : {}),
          },
          { status: 503 },
        ),
      );
    const { result, unmount } = renderHook(() => useGitHubSources());
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    await act(async () => {
      await result.current.generate();
    });
    expect(result.current.state.snapshot).toEqual(fresh ? updated : snapshot);
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.briefError).toBe("Try again.");
    expect(result.current.state.brief).toBeNull();
    unmount();
  },
);

it("keeps the AI cooldown across source refresh without disabling source browsing", async () => {
  vi.useFakeTimers();
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockResolvedValueOnce(
      Response.json(
        {
          error: "rate-limited",
          stage: "brief",
          message: "Wait.",
          retryAfter: 60,
          snapshot,
        },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ snapshot }));
  const { result, unmount } = renderHook(() => useGitHubSources());
  await act(async () => {});
  await act(async () => {
    await result.current.generate();
  });
  expect(result.current.state.retryAt).toBeNull();
  expect(result.current.state.briefRetryAt).toBe(Date.now() + 60_000);
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    await result.current.generate();
  });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(result.current.state.briefRetryAt).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  unmount();
});

it("clears a generated brief when a restored page rechecks an expired session", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ snapshot }))
    .mockResolvedValueOnce(Response.json({ snapshot, brief }))
    .mockResolvedValueOnce(
      Response.json(
        { error: "unauthorized", message: "Reconnect GitHub." },
        { status: 401 },
      ),
    );
  const { result, unmount } = renderHook(() => useGitHubSources());
  await waitFor(() => expect(result.current.state.loading).toBe(false));
  await act(async () => {
    await result.current.generate();
  });
  expect(result.current.state.brief).toEqual(brief);
  await act(async () => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  expect(result.current.state.brief).toBeNull();
  expect(result.current.state.snapshot.items).toHaveLength(0);
  expect(result.current.state.expired).toBe(true);
  unmount();
});
