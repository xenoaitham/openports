import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanBannerLine,
  isTlsPort,
  parseHttpHead,
} from "../src/lib/banners";

test("cleanBannerLine keeps the first line, strips control characters", () => {
  assert.equal(cleanBannerLine("SSH-2.0-OpenSSH_9.6p1 Ubuntu\r\n"), "SSH-2.0-OpenSSH_9.6p1 Ubuntu");
  assert.equal(cleanBannerLine("220 mail.example.com ESMTP\x00\x1f junk"), "220 mail.example.com ESMTP junk");
  assert.equal(cleanBannerLine(""), "");
  assert.equal(cleanBannerLine("\r\n\r\n"), "");
});

test("cleanBannerLine caps the length so a hostile banner cannot bloat a row", () => {
  const long = cleanBannerLine("A".repeat(500));
  assert.ok(long.length <= 160);
  assert.ok(long.startsWith("A"));
});

test("parseHttpHead reads the status line and the server header", () => {
  assert.equal(
    parseHttpHead("HTTP/1.1 301 Moved Permanently\r\nLocation: https://x/\r\nServer: nginx/1.24\r\n\r\n"),
    "HTTP 301 Moved Permanently; server nginx/1.24",
  );
  assert.equal(
    parseHttpHead("HTTP/1.0 404 Not Found\r\n\r\n"),
    "HTTP 404 Not Found",
  );
});

test("parseHttpHead refuses anything that is not an http response", () => {
  assert.equal(parseHttpHead("garbage bytes \x01\x02"), null);
  assert.equal(parseHttpHead(""), null);
});

test("only known TLS ports are treated as TLS", () => {
  for (const port of [443, 465, 993, 995]) assert.ok(isTlsPort(port));
  for (const port of [22, 80, 8080, 9929, 31337]) assert.ok(!isTlsPort(port));
});
