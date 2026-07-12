import { test, expect } from "vitest";
import { NextRequest } from "next/server";
import { apiOk } from "@/lib/api";
test("nextrequest+response", async () => {
  const req = new NextRequest("http://localhost/api/x", {
    method: "POST",
    body: JSON.stringify({ a: 1 }),
    headers: { "content-type": "application/json" },
  });
  const body = await req.json();
  expect(body.a).toBe(1);
  const res = apiOk({ hi: "there" });
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.data.hi).toBe("there");
  expect(res.status).toBe(200);
});
