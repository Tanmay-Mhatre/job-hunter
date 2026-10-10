import { describe, expect, it } from "vitest";
import { ROLE_FAMILIES } from "../src/catalog/roles";
import { expandTitleTerms, matchesTitle, titleForms } from "../src/text";

const yes = (title: string, ...terms: string[]) => expect(matchesTitle(title, terms), `${title} ~ ${terms}`).toBe(true);
const no = (title: string, ...terms: string[]) => expect(matchesTitle(title, terms), `${title} !~ ${terms}`).toBe(false);

describe("matchesTitle", () => {
  it("reads plurals as singular", () => {
    yes("Product Designers", "product designer");
    yes("Senior Software Engineers (Payments)", "software engineer");
    yes("Solution Architect", "solutions architect");
  });

  it("spells out short forms, both ways", () => {
    yes("Sr. PM", "senior product manager");
    yes("Sr PM, Payments", "product manager");
    yes("Senior Product Manager", "pm");
    yes("SWE II", "software engineer");
    yes("ML Engineer", "machine learning engineer");
    yes("Machine Learning Engineer", "ml engineer");
    yes("SRE", "site reliability engineer");
    yes("VP of Product", "vp product");
    yes("Product Mgr", "product manager");
    yes("Eng Manager", "engineering manager");
    yes("Head of Eng", "head of engineering");
    yes("Sr. Eng", "senior engineer");
    yes("CTO", "chief technology officer");
    yes("Chief Product Officer", "cpo");
  });

  it("turns 'Manager, Product' around, only after a job noun", () => {
    yes("Manager, Product", "product manager");
    yes("Senior Manager, Product", "senior product manager");
    yes("Director, Product Management", "director of product");
    yes("Engineer - Backend", "backend engineer");
    yes("Software Engineer II, Backend", "backend engineer");
    no("Payments, Product", "product payment");
    no("Product, Manager of Things", "product manager");
  });

  it("doesn't turn a team lead or engineering manager into the product's lead or manager", () => {
    no("Team Lead, Android Core Product - Manchester, United Kingdom", "product lead");
    no("Team Lead, Core Product", "product lead", "product manager");
    no("Engineering Manager, Product", "product manager");
    no("Tech Lead, Product Platform", "product lead");
    yes("Lead, Product", "product lead");
    yes("Manager, Product", "product manager");
    yes("Senior Manager, Product - Payments", "senior product manager");
    yes("Software Engineer II, Backend", "backend engineer");
  });

  it("reads AM and PM as a shift in shift work, and SAP PM as plant maintenance", () => {
    no("Handler / Warehouse Operator (PM)", "product manager");
    no("Handler Hourly Sturup PM", "product manager");
    no("Package Handler - PM Shift", "product manager");
    no("SAP PM Consultant", "product manager");
    yes("Senior PM, Payments", "product manager");
    yes("PM - Warehouse Management System", "product manager");
  });

  it("splits slashes into each reading", () => {
    yes("UX/UI Designer", "ux designer");
    yes("UX/UI Designer", "ui designer");
    yes("UX/UI Designer", "user experience designer");
    yes("AI/ML Engineer", "ml engineer");
    yes("Product Manager / Product Owner", "product owner");
  });

  it("spells compounds one way", () => {
    yes("Full-Stack Developer", "fullstack developer");
    yes("Fullstack Engineer", "full stack engineer");
    yes("Front End Engineer", "frontend engineer");
  });

  it("matches equivalent titles, but not broader ones", () => {
    yes("Senior Software Developer", "senior software engineer");
    yes("Backend Developer", "backend engineer");
    yes("Product Director", "director of product");
    no("Product Owner", "product manager");
    expect(expandTitleTerms(["product manager"], { broad: true })).toContain("product owner");
  });

  it("keeps whole words: production and product are different jobs", () => {
    no("Production Manager", "product manager");
    no("Senior Production Engineer", "product engineer");
    no("Producer", "product manager");
    no("Engineering Manager", "software engineer");
    no("Software Engineering Manager", "software engineer");
  });

  it("reads excludes the same way", () => {
    yes("Sr. Product Marketing Manager", "product marketing");
    yes("PMM, Growth", "product marketing");
    yes("Jr. Designer", "junior");
  });

  it("still matches what plain whole-word matching did", () => {
    yes("Senior Product-Manager", "product manager");
    yes("Product - Manager", "product manager");
    no("Anything", ...[]);
  });

  it("every catalogue title matches itself and its plural", () => {
    for (const f of ROLE_FAMILIES)
      for (const t of f.titles) {
        yes(t, t);
        if (/^[a-z ]+[^s]$/.test(t)) yes(`Senior ${t}s`, t);
      }
  });
});

describe("titleForms", () => {
  it("keeps readings apart so no term matches across a comma", () => {
    expect(titleForms("Sr. Manager, Product")).toBe("senior manager | product | senior product manager | senior manager of product");
    no("Product, Manager", "product manager");
  });
});
