import { describe, expect, it } from "vitest";
import { htmlToText, inferWorkplace, matchesTerm } from "../src/text";

describe("matchesTerm", () => {
  it("matches whole words only", () => {
    expect(matchesTerm("Senior AI Product Manager", "ai")).toBe(true);
    expect(matchesTerm("AI-native payments", "ai")).toBe(true);
    expect(matchesTerm("Maintain our detail-oriented culture", "ai")).toBe(false);
    expect(matchesTerm("Product Managers", "product manager")).toBe(false);
  });

  it("is case-insensitive and treats spaces and hyphens alike", () => {
    expect(matchesTerm("SENIOR PRODUCT-MANAGER", "product manager")).toBe(true);
    expect(matchesTerm("Remote-MENA", "remote - mena")).toBe(true);
    expect(matchesTerm("Remote MENA", "remote-mena")).toBe(true);
  });

  it("escapes regex characters in terms", () => {
    expect(matchesTerm("Experience with C++ required", "c++")).toBe(true);
    expect(matchesTerm("Abu Dhabi (UAE)", "uae")).toBe(true);
  });

  it("does not treat accented letters as word boundaries", () => {
    expect(matchesTerm("Zürich", "rich")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("decodes double-escaped Greenhouse HTML", () => {
    const html = "&lt;h2&gt;Role&lt;/h2&gt;&lt;p&gt;Payments &amp;amp; KYC&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;";
    expect(htmlToText(html)).toBe("Role\nPayments & KYC\n\n• One");
  });

  it("handles normal HTML, numeric entities and empty input", () => {
    expect(htmlToText("<p>It&#39;s&nbsp;<b>great</b></p><script>x()</script>")).toBe("It's great");
    expect(htmlToText(null)).toBe("");
  });

  it("keeps literal &lt; in prose that is already real HTML", () => {
    expect(htmlToText("<p>Use 1 &lt; 2</p>")).toBe("Use 1 < 2");
  });
});

describe("inferWorkplace", () => {
  it("reads remote and hybrid from free text", () => {
    expect(inferWorkplace("Dubai or Remote")).toBe("remote");
    expect(inferWorkplace("London (Hybrid)")).toBe("hybrid");
    expect(inferWorkplace("Dubai")).toBe("unknown");
  });
});
