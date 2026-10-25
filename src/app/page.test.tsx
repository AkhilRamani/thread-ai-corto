// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/server/config", () => ({ getAuthConfig: () => null }));
vi.mock("@/lib/server/session", () => ({ getSignedInUser: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));
import { redirect } from "next/navigation";
import { getSignedInUser } from "@/lib/server/session";
import HomePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSignedInUser).mockResolvedValue(null);
});

it("ignores inherited, unknown, and repeated auth query values without crashing", async () => {
  for (const auth of [
    "__proto__",
    "constructor",
    "toString",
    "unknown",
    ["failed", "expired"],
  ]) {
    const html = renderToStaticMarkup(
      await HomePage({ searchParams: Promise.resolve({ auth }) }),
    );
    expect(html).toContain("Pick up where you left off.");
    expect(html).not.toContain('role="alert"');
  }
});

it("keeps supported sign-in error messages", async () => {
  const html = renderToStaticMarkup(
    await HomePage({ searchParams: Promise.resolve({ auth: "failed" }) }),
  );
  expect(html).toContain("GitHub sign-in could not be completed.");
});

it("ignores unknown auth values when redirecting a signed-in user", async () => {
  vi.mocked(getSignedInUser).mockResolvedValue({ id: 1, login: "octocat" });
  await expect(
    HomePage({ searchParams: Promise.resolve({ auth: "__proto__" }) }),
  ).rejects.toThrow("redirect");
  expect(redirect).toHaveBeenCalledWith("/dashboard");
});
