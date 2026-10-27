import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "./use-project";
import { sampleRecording } from "@/lib/sample-data";
const selection = sampleRecording.snapshot.selection;
const loaded = () => Response.json({ snapshot: sampleRecording.snapshot });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
describe("project lifecycle and stale responses", () => {
  it("loads sources before generation and sends only selection identifiers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(loaded());
    const { result } = renderHook(() => useProject(false));
    await act(async () => {
      await result.current.run("sources", selection);
    });
    expect(result.current.state.snapshot).toEqual(sampleRecording.snapshot);
    expect(result.current.state.investigation).toBeUndefined();
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string),
    ).toEqual({ selection });
  });
  it("prevents duplicate submits synchronously", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useProject(false));
    let first!: Promise<void>;
    act(() => {
      first = result.current.run("sources", selection);
      void result.current.run("sources", selection);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(loaded());
      await first;
    });
  });
  it("scope changes abort and prevent obsolete results from restoring old sources", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useProject(false));
    let first!: Promise<void>;
    act(() => {
      first = result.current.run("sources", selection);
    });
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    act(() => result.current.invalidate());
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(loaded());
      await first;
    });
    expect(result.current.state.snapshot).toBeUndefined();
    expect(result.current.state.busy).toBeNull();
  });
  it("an obsolete completion cannot unlock or overwrite a newer request", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useProject(false));
    let oldRun!: Promise<void>;
    let newRun!: Promise<void>;
    act(() => {
      oldRun = result.current.run("sources", selection);
      result.current.invalidate();
      newRun = result.current.run("sources", selection);
    });
    await act(async () => {
      first.resolve(loaded());
      await oldRun;
    });
    expect(result.current.state.busy).toBe("sources");
    expect(result.current.state.snapshot).toBeUndefined();
    await act(async () => {
      await result.current.run("sources", selection);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      second.resolve(loaded());
      await newRun;
    });
    expect(result.current.state.snapshot).toEqual(sampleRecording.snapshot);
    expect(result.current.state.busy).toBeNull();
  });
  it("refresh and Notion disconnection invalidate derived results while retaining inspectable GitHub", async () => {
    const { result } = renderHook(() => useProject(true));
    expect(result.current.state.investigation).toBeDefined();
    act(() => result.current.invalidate(true, true));
    expect(result.current.state.investigation).toBeUndefined();
    expect(result.current.state.impact).toBeUndefined();
    expect(
      result.current.state.snapshot!.evidence.every(
        (e) => e.provider === "github",
      ),
    ).toBe(true);
    expect(result.current.state.snapshot!.selection.pageIds).toEqual([]);
  });
  it("context-changed responses clear findings and receipt before another assessment", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          snapshot: sampleRecording.snapshot,
          investigation: sampleRecording.investigation,
          receipt: "signed-context",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          snapshot: sampleRecording.snapshot,
          contextChanged: true,
          message: "Context changed",
        }),
      );
    const { result } = renderHook(() => useProject(false));
    await act(async () => {
      await result.current.run("investigate", selection);
    });
    await act(async () => {
      await result.current.run(
        "impact",
        selection,
        "What if expiry is five minutes?",
      );
    });
    expect(result.current.state.investigation).toBeUndefined();
    expect(result.current.state.receipt).toBeUndefined();
    expect(result.current.state.message).toBe("Context changed");
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string),
    ).toEqual({
      selection,
      question: "What if expiry is five minutes?",
      receipt: "signed-context",
    });
  });
  it("keeps evidence on model failure, clears everything on GitHub expiry, and honours retry delay", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(loaded())
      .mockResolvedValueOnce(
        Response.json(
          {
            error: "rate-limited",
            provider: "model",
            message: "Wait",
            retryAfter: 60,
          },
          { status: 429 },
        ),
      );
    const { result } = renderHook(() => useProject(false));
    await act(async () => {
      await result.current.run("sources", selection);
    });
    await act(async () => {
      await result.current.run("investigate", selection);
    });
    expect(result.current.state.snapshot).toBeDefined();
    expect(result.current.state.error).toBe("Wait");
    await act(async () => {
      await result.current.run("sources", selection);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const expired = renderHook(() => useProject(false));
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        { error: "unauthorized", provider: "github", message: "Reconnect" },
        { status: 401 },
      ),
    );
    await act(async () => {
      await expired.result.current.run("sources", selection);
    });
    expect(expired.result.current.state.expired).toBe(true);
    expect(expired.result.current.state.snapshot).toBeUndefined();
  });
  it("unmount aborts pending requests", () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useProject(false));
    act(() => {
      void result.current.run("sources", selection);
    });
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
  it("sample replay uses no providers and clears the result on refresh", async () => {
    const { result } = renderHook(() => useProject(true));
    await act(async () => {
      await result.current.run("sources", selection);
    });
    expect(result.current.state.investigation).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    act(() => result.current.showSampleState("partial"));
    await waitFor(() =>
      expect(
        result.current.state.snapshot!.evidence.every(
          (e) => e.provider === "github",
        ),
      ).toBe(true),
    );
  });
});
