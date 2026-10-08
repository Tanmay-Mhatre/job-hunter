import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { digest, findTelegramChat, finishedMessage, looksLikeToken, maskToken, saveTelegramSecrets, sendTelegram, telegramSecrets } from "../src/notify";
import { acquireScanLock, releaseScanLock } from "../src/scan";
import { installSchedule, nextRunAt, readScheduledRuns, recordScheduledRun, removeSchedule, scheduleStatus, validateSchedule } from "../src/schedule";
import type { Job } from "../src/schema";

const job = (title: string, score: number, extra: Partial<Job> = {}): Job =>
  ({
    id: `greenhouse:co:${title}`,
    ats: "greenhouse",
    company: "Co <&>",
    title,
    location: "Dubai, UAE; Remote",
    url: `https://example.com/${encodeURIComponent(title)}`,
    firstSeen: "2026-10-01T00:00:00Z",
    lastSeen: "2026-10-01T00:00:00Z",
    status: "open",
    score,
    why: { title: 30, location: 20, keywords: [], keywordPoints: 0, freshness: 10 },
    ...extra,
  }) as Job;

describe("digest", () => {
  it("says nothing when there's nothing new", () => {
    expect(digest([], { minScore: 70 })).toBeUndefined();
  });

  it("lists the best first with stars for strong ones, links, escaped text and the first place only", () => {
    const text = digest([job("PM", 60), job("Head of Product", 85)], { minScore: 70, scopeLabel: "My companies + my industries" })!;
    expect(text.startsWith("<b>2 new jobs for you</b> · 1 strong\n<i>My companies + my industries</i>")).toBe(true);
    expect(text.indexOf("Head of Product")).toBeLessThan(text.indexOf(">PM<"));
    expect(text).toContain('⭐ <b>85</b> <a href="https://example.com/Head%20of%20Product">Head of Product</a>\nCo &lt;&amp;&gt; · Dubai, UAE');
  });

  it("caps at 10 lines and points to the rest", () => {
    const text = digest(Array.from({ length: 13 }, (_, i) => job(`Role ${i}`, 50 + i)), { minScore: 90 })!;
    expect(text.match(/<a /g)).toHaveLength(10);
    expect(text).toContain("…and 3 more on your Radar.");
  });
});

describe("finishedMessage", () => {
  it("always says the scan is done, with totals, then the new jobs or 'no new jobs'", () => {
    const none = finishedMessage({ scopeLabel: "All companies", matches: 3, newJobs: [], minScore: 70, total: 16538 });
    expect(none).toBe("✅ <b>All companies scan finished</b>: 16,538 companies checked.\n3 jobs match you, 0 new.\nNo new jobs this time.");
    const some = finishedMessage({ scopeLabel: "All companies", matches: 5, newJobs: [job("PM", 80)], minScore: 70 });
    expect(some).toContain("5 jobs match you, 1 new.\n\n<b>1 new job for you</b>");
  });

  it("says where a stopped scan got to", () => {
    expect(finishedMessage({ scopeLabel: "All companies", matches: 0, newJobs: [], minScore: 70, stopped: true, done: 900, total: 16538 })).toMatch(/^⏸ <b>All companies scan stopped<\/b> at 900 of 16,538 companies\. Start it again/);
  });
});

describe("telegram secrets and API", () => {
  it("keeps the token in profile/secrets.json, masks it for display, and checks its shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "jh-tg-"));
    saveTelegramSecrets({ token: "123456789:AAFabcdefghijklmnopqrstuvwxyz0123456", bot: "@my_bot" }, dir);
    saveTelegramSecrets({ chatId: "42" }, dir);
    expect(telegramSecrets(dir)).toMatchObject({ token: "123456789:AAFabcdefghijklmnopqrstuvwxyz0123456", chatId: "42", bot: "@my_bot" });
    expect(maskToken(telegramSecrets(dir).token)).toBe("123456789:AAF…456");
    saveTelegramSecrets({ token: "", chatId: "" }, dir);
    expect(telegramSecrets(dir).token).toBeUndefined();
    expect(looksLikeToken("123456789:AAFabcdefghijklmnopqrstuvwxyz0123456")).toBe(true);
    expect(looksLikeToken("hello")).toBe(false);
  });

  it("finds the chat that messaged the bot, and sends HTML messages to it", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      const result = url.endsWith("/getUpdates") ? [{ message: { chat: { id: 99, type: "private", first_name: "Sam" } } }] : true;
      return new Response(JSON.stringify({ ok: true, result }));
    }) as typeof fetch;
    expect(await findTelegramChat("t:k", fake)).toEqual({ chatId: "99", name: "Sam" });
    await sendTelegram("<b>hi</b>", { token: "t:k", chatId: "99" }, fake);
    expect(calls[1]).toMatchObject({ url: "https://api.telegram.org/bott:k/sendMessage", body: { chat_id: "99", text: "<b>hi</b>", parse_mode: "HTML" } });
  });

  it("explains a bad token in plain words", async () => {
    const fake = (async () => new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 })) as unknown as typeof fetch;
    await expect(sendTelegram("x", { token: "bad", chatId: "1" }, fake)).rejects.toThrow(/didn't accept that bot token/);
  });
});

describe("schedule", () => {
  it("validates times and scope", () => {
    expect(validateSchedule({ times: ["20:00", "08:00", "08:00"], scope: "mine" })).toEqual({ times: ["08:00", "20:00"], scope: "mine" });
    expect(() => validateSchedule({ times: ["8am"], scope: "mine" })).toThrow(/08:00/);
    expect(() => validateSchedule({ times: [], scope: "all" })).toThrow(/one to four/);
  });

  it("knows the next run", () => {
    const now = new Date(2026, 9, 8, 9, 0);
    expect(nextRunAt(["08:00", "20:00"], now)).toBe(new Date(2026, 9, 8, 20, 0).toISOString());
    expect(nextRunAt(["08:00"], now)).toBe(new Date(2026, 9, 9, 8, 0).toISOString());
  });

  it("Windows: registers a task that catches up missed runs, wakes the PC and runs without a window", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "jh-sched-"));
    const scripts: string[] = [];
    const exec = (_cmd: string, args: string[]) => {
      scripts.push(args.at(-1)!);
      return { status: 0, stdout: "", stderr: "" };
    };
    // An absolute path on any system (tests also run on Linux CI), with a quote PowerShell must escape.
    const repo = join(tmpdir(), "Repo It's");
    installSchedule({ repoRoot: repo, dataDir, exec, platform: "win32" }, { times: ["08:00", "20:00"], scope: "all" });
    const script = scripts[0]!;
    expect(script).toContain("-StartWhenAvailable -WakeToRun");
    expect(script).toContain("-ExecutionTimeLimit (New-TimeSpan -Hours 4)");
    expect(script).toContain("New-ScheduledTaskTrigger -Daily -At '08:00'");
    expect(script).toContain("New-ScheduledTaskTrigger -Daily -At '20:00'");
    expect(script).toContain("-Execute 'conhost.exe' -Argument '--headless ");
    expect(script).toContain("scan --scope all --notify --scheduled --data");
    // A quote in a path is doubled for PowerShell.
    expect(script).toContain(`-WorkingDirectory '${repo.replace(/'/g, "''")}'`);
    expect(JSON.parse(readFileSync(join(dataDir, "schedule.json"), "utf8"))).toEqual({ times: ["08:00", "20:00"], scope: "all" });

    removeSchedule({ repoRoot: repo, dataDir, exec, platform: "win32" });
    expect(scripts.at(-1)).toContain("Unregister-ScheduledTask -TaskName 'JobHunter Scan'");
    expect(existsSync(join(dataDir, "schedule.json"))).toBe(false);
  });

  it("macOS: writes a launch agent with each time; Linux: a persistent systemd timer", () => {
    const home = mkdtempSync(join(tmpdir(), "jh-home-"));
    const dataDir = mkdtempSync(join(tmpdir(), "jh-sched-"));
    const exec = () => ({ status: 0, stdout: "", stderr: "" });
    installSchedule({ repoRoot: "/repo", dataDir, exec, platform: "darwin", home }, { times: ["07:30"], scope: "mine" });
    const plist = readFileSync(join(home, "Library/LaunchAgents/com.jobhunter.scan.plist"), "utf8");
    expect(plist).toContain("<key>Hour</key><integer>7</integer><key>Minute</key><integer>30</integer>");
    expect(plist).toContain("<string>--notify</string>");
    expect(scheduleStatus({ repoRoot: "/repo", dataDir, exec, platform: "darwin", home }).installed).toBe(true);

    installSchedule({ repoRoot: "/repo", dataDir, exec, platform: "linux", home }, { times: ["07:30", "19:00"], scope: "mine" });
    const timer = readFileSync(join(home, ".config/systemd/user/jobhunter-scan.timer"), "utf8");
    expect(timer).toContain("OnCalendar=*-*-* 07:30:00\nOnCalendar=*-*-* 19:00:00\nPersistent=true");
  });

  it("logs scheduled runs, newest first", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "jh-sched-"));
    recordScheduledRun(dataDir, { startedAt: "2026-10-08T04:00:00Z", scope: "mine", ok: true, matches: 3 });
    recordScheduledRun(dataDir, { startedAt: "2026-10-09T04:00:00Z", scope: "mine", ok: false, error: "offline" });
    expect(readScheduledRuns(dataDir).map((r) => r.startedAt)).toEqual(["2026-10-09T04:00:00Z", "2026-10-08T04:00:00Z"]);
  });
});

describe("scan lock", () => {
  it("lets one scan at a time hold a data folder, and takes over a lock left by a process that's gone", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "jh-lock-"));
    expect(acquireScanLock(dataDir)).toBe(true);
    releaseScanLock(dataDir);
    expect(existsSync(join(dataDir, "scan.lock"))).toBe(false);
    // A process id that can't exist.
    writeFileSync(join(dataDir, "scan.lock"), "999999999");
    expect(acquireScanLock(dataDir)).toBe(true);
    // A live process (the test runner's parent) holds it.
    writeFileSync(join(dataDir, "scan.lock"), String(process.ppid));
    expect(acquireScanLock(dataDir)).toBe(false);
  });
});
