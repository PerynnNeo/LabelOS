import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/domain/html-sanitizer";

describe("sanitizeHtml — removes dangerous elements", () => {
  it("strips <script> together with its contents", () => {
    expect(sanitizeHtml("<script>alert(1)</script><p>Safe</p>")).toBe(
      "<p>Safe</p>",
    );
    expect(sanitizeHtml("<p>ok<script>steal()</script></p>")).toBe("<p>ok</p>");
  });

  it("strips <style> together with its contents", () => {
    expect(sanitizeHtml("<style>p{color:red}</style><p>Hi</p>")).toBe(
      "<p>Hi</p>",
    );
  });

  it("strips <iframe> together with its contents", () => {
    expect(
      sanitizeHtml('<iframe src="https://evil.example"></iframe><p>Hi</p>'),
    ).toBe("<p>Hi</p>");
  });

  it("removes on* event-handler attributes", () => {
    expect(sanitizeHtml('<p onclick="steal()">Hi</p>')).toBe("<p>Hi</p>");
    // A disallowed tag with an on* handler is unwrapped, keeping its text.
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe("");
    expect(sanitizeHtml('<a href="x" onclick="y()">link</a>')).toBe("link");
  });
});

describe("sanitizeHtml — keeps the allowlist", () => {
  it("keeps allowlisted formatting tags (attribute-free)", () => {
    expect(sanitizeHtml("<p><strong>Bold</strong> and <em>italic</em></p>")).toBe(
      "<p><strong>Bold</strong> and <em>italic</em></p>",
    );
    expect(sanitizeHtml("<h3>Title</h3><h4>Sub</h4>")).toBe(
      "<h3>Title</h3><h4>Sub</h4>",
    );
    expect(sanitizeHtml("line<br>break")).toBe("line<br>break");
  });

  it("preserves nested lists", () => {
    expect(sanitizeHtml("<ul><li>a</li><li>b</li></ul>")).toBe(
      "<ul><li>a</li><li>b</li></ul>",
    );
    expect(sanitizeHtml("<ol><li>one</li></ol>")).toBe("<ol><li>one</li></ol>");
  });

  it("drops the class/style attributes but keeps the allowed tag", () => {
    expect(sanitizeHtml('<p class="lead" style="color:red">Body</p>')).toBe(
      "<p>Body</p>",
    );
  });
});

describe("sanitizeHtml — unwraps disallowed tags and strips noise", () => {
  it("unwraps non-allowlisted tags but keeps their text", () => {
    expect(sanitizeHtml("<div>text</div>")).toBe("text");
    expect(sanitizeHtml("<span>x</span>")).toBe("x");
  });

  it("removes comments", () => {
    expect(sanitizeHtml("<!-- secret --><p>Visible</p>")).toBe("<p>Visible</p>");
  });

  it("returns an empty string for empty / non-string input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(undefined as unknown as string)).toBe("");
  });
});
