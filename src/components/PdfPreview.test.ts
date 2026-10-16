import { describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {} }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({ default: "" }));

const { findHeading } = await import("./PdfPreview");
const { templateById } = await import("../lib/templates");

const A4 = { width: 595.28, height: 841.89 };
const run = (text: string, x: number, y: number, fontSize = 10) => ({ text, x, y, width: text.length * 5, fontSize });

describe("findHeading", () => {
  const pages = [
    {
      ...A4,
      runs: [
        run("HARUKA KOBAYASHI", 51, 790, 30),
        run("Education", 51, 700),
        // A bullet in the section body that starts with the same words.
        run("•", 140, 600),
        run("Selected coursework: Stochastic Calculus", 150, 600)
      ]
    },
    { ...A4, runs: [run("Selected", 51, 400), run("Coursework", 51, 388), run("Mathematics", 140, 400)] }
  ];

  it("matches the section title in the label column, not body text", () => {
    expect(findHeading(pages, { cvIndex: 0, text: "Selected\nCoursework", nonce: 1 })).toEqual({ page: 2, y: 1 - 400 / A4.height });
  });

  it("falls back to the first page of that CV", () => {
    expect(findHeading(pages, { cvIndex: 0, text: "Missing", nonce: 1 })).toEqual({ page: 1, y: 0 });
  });

  it("finds full-width Timeline titles by their size, not body text in the same place", () => {
    const timeline = templateById("timeline").layout;
    const page = {
      ...A4,
      runs: [
        run("HARUKA KOBAYASHI", 200, 790, 25),
        // A bullet in the detail column and a paper paragraph at the margin, both starting with the title's words.
        run("Selected coursework: Stochastic Calculus", 190, 700),
        run("Selected Coursework and more", 95, 650),
        run("Selected", 95, 500, 14.4),
        run("Coursework", 160, 500, 14.4)
      ]
    };
    expect(findHeading([page], { cvIndex: 0, text: "Selected Coursework", nonce: 1 }, timeline)).toEqual({ page: 1, y: 1 - 500 / A4.height });
  });
});
