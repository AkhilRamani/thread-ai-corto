import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

afterEach(cleanup);

it("supports keyboard dismissal and preserves native POST sign-out", async () => {
  render(
    <SiteHeader user={{ id: 7, login: "octocat" }} mode="live" view="brief" />,
  );
  const trigger = screen.getByRole("button", { name: "octocat account menu" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const example = await screen.findByRole("menuitem", {
    name: "Explore example",
  });
  expect(example.getAttribute("href")).toBe("/sample");
  const signOut = screen.getByRole("menuitem", { name: "Sign out" });
  const form = signOut.closest("form")!;
  expect(form.getAttribute("action")).toBe("/api/auth/logout");
  expect(form.getAttribute("method")).toBe("post");
  const submitted = vi.fn((event: Event) => event.preventDefault());
  form.addEventListener("submit", submitted);
  fireEvent.click(signOut);
  expect(submitted).toHaveBeenCalledOnce();
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it("offers GitHub sign-in in the anonymous sample menu", async () => {
  render(<SiteHeader mode="sample" view="plan" />);
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Example account menu" }),
    { key: "Enter" },
  );
  const signIn = await screen.findByRole("menuitem", {
    name: "Continue with GitHub",
  });
  expect(signIn.getAttribute("href")).toBe("/api/auth/github");
  expect(screen.queryByRole("menuitem", { name: "Sign out" })).toBeNull();
  expect(screen.getByText("Synthetic example workspace")).toBeTruthy();
});
