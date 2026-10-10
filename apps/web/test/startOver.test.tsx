// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartOver } from "../src/components/Settings";

afterEach(cleanup);

describe("Settings > Start setup over", () => {
  it("asks first; Cancel clears nothing", async () => {
    const onStartOver = vi.fn(async () => null);
    render(<StartOver onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole("button", { name: /start setup over/i }));
    expect(screen.getByRole("heading", { name: "Start setup over?" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onStartOver).not.toHaveBeenCalled();
  });

  it("Clear setup resets, and shows the error when it fails", async () => {
    const onStartOver = vi.fn(async () => "A scan is running; try again when it's done.");
    render(<StartOver onStartOver={onStartOver} />);
    await userEvent.click(screen.getByRole("button", { name: /start setup over/i }));
    await userEvent.click(screen.getByRole("button", { name: "Clear setup" }));
    expect(onStartOver).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toMatch(/scan is running/);
  });
});
