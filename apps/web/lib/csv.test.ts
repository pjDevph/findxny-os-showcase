import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("emits header row even for empty input when columns are passed", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });

  it("returns empty string for empty input with no columns hint", () => {
    expect(toCsv([])).toBe("");
  });

  it("uses object keys as headers when no columns passed", () => {
    expect(toCsv([{ id: 1, name: "Cookie" }])).toBe("id,name\n1,Cookie");
  });

  it("respects column order and subset", () => {
    expect(toCsv([{ id: 1, name: "Cookie", price: 50 }], ["name", "price"]))
      .toBe("name,price\nCookie,50");
  });

  it("quotes values containing commas", () => {
    expect(toCsv([{ x: "a,b" }])).toBe("x\n\"a,b\"");
  });

  it("quotes and doubles embedded quotes (RFC 4180)", () => {
    expect(toCsv([{ x: 'he said "hi"' }])).toBe('x\n"he said ""hi"""');
  });

  it("quotes values containing newlines", () => {
    expect(toCsv([{ x: "line1\nline2" }])).toBe('x\n"line1\nline2"');
  });

  it("renders null/undefined as empty cell", () => {
    expect(toCsv([{ a: null, b: undefined, c: 0 }])).toBe("a,b,c\n,,0");
  });

  it("ISO-serializes Date values", () => {
    const d = new Date("2024-01-15T10:00:00.000Z");
    expect(toCsv([{ when: d }])).toBe(`when\n${d.toISOString()}`);
  });

  it("JSON-stringifies plain objects", () => {
    // Object stringification produces braces+commas → must be quoted.
    expect(toCsv([{ meta: { a: 1 } }])).toBe('meta\n"{""a"":1}"');
  });

  describe("CSV injection hardening", () => {
    // Leading =, +, -, @, tab, CR all let Excel/Sheets interpret a cell as a
    // formula. We prefix a single-quote so the cell stays a string.
    it("prefixes single quote on formula-leading values", () => {
      expect(toCsv([{ x: "=SUM(1,2)" }])).toBe('x\n"' + "'=SUM(1,2)" + '"');
      expect(toCsv([{ x: "+1+1" }])).toBe("x\n'+1+1");
      expect(toCsv([{ x: "-1" }])).toBe("x\n'-1");
      expect(toCsv([{ x: "@cmd" }])).toBe("x\n'@cmd");
      expect(toCsv([{ x: "\tinjected" }])).toBe("x\n'\tinjected");
    });

    it("leaves benign values alone", () => {
      expect(toCsv([{ x: "Cookie 25" }])).toBe("x\nCookie 25");
      expect(toCsv([{ x: "100" }])).toBe("x\n100");
    });
  });
});
