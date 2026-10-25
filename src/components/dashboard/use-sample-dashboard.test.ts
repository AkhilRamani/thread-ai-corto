import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSampleDashboard } from "./use-sample-dashboard";

describe("sample dashboard transitions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("invalidates the brief immediately on refresh and requires explicit generation", () => {
    const { result } = renderHook(useSampleDashboard);
    act(() => result.current.refresh());
    expect(result.current.state.brief).toBeNull();
    expect(result.current.state.operation).toBe("refreshing");
    act(() => vi.runAllTimers());
    expect(result.current.state.operation).toBe("idle");
    expect(result.current.state.snapshot.items).toHaveLength(2);
    expect(result.current.state.brief).toBeNull();
    act(() => result.current.generate());
    expect(result.current.state.operation).toBe("generating");
    act(() => vi.runAllTimers());
    expect(result.current.state.brief?.sourceIds).toEqual([
      "pr-142",
      "issue-138",
    ]);
  });

  it("does not let an old pending generation overwrite a newly selected state", () => {
    const { result } = renderHook(useSampleDashboard);
    act(() => result.current.generate());
    act(() => result.current.selectScenario("empty"));
    act(() => vi.runAllTimers());
    expect(result.current.state.snapshot.items).toEqual([]);
    expect(result.current.state.brief).toBeNull();
    expect(result.current.state.operation).toBe("idle");
  });

  it("keeps sources usable after a brief failure and recovers on retry", () => {
    const { result } = renderHook(useSampleDashboard);
    act(() => result.current.selectScenario("brief-error"));
    expect(result.current.state.briefError).toBe(true);
    expect(result.current.state.snapshot.items).toHaveLength(2);
    act(() => result.current.generate());
    act(() => vi.runAllTimers());
    expect(result.current.state.briefError).toBe(false);
    expect(result.current.state.brief).not.toBeNull();
  });

  it("only cites available evidence when regenerating partial coverage", () => {
    const { result } = renderHook(useSampleDashboard);
    act(() => result.current.selectScenario("partial"));
    act(() => result.current.generate());
    act(() => vi.runAllTimers());
    const ids = result.current.state.snapshot.items.map((source) => source.id);
    expect(
      result.current.state.brief?.sourceIds.every((id) => ids.includes(id)),
    ).toBe(true);
    expect(result.current.state.brief?.nextStep).toBeUndefined();
  });

  it("cannot generate without source data and cancels work on unmount", () => {
    const { result, unmount } = renderHook(useSampleDashboard);
    act(() => result.current.selectScenario("source-error"));
    act(() => result.current.generate());
    expect(result.current.state.operation).toBe("idle");
    act(() => result.current.refresh());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
