import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPreallowed,
  isPrivateAddress,
  normalizeDomain,
} from "../src/lib/host";

test("normalizeDomain strips the junk people paste", () => {
  assert.equal(normalizeDomain("HTTPS://Example.com/path"), "example.com");
  assert.equal(normalizeDomain("  example.com. "), "example.com");
  assert.equal(normalizeDomain("example.com:8080"), "example.com");
  assert.equal(normalizeDomain("https://example.com?q=1"), "example.com");
  assert.equal(normalizeDomain("scanme.nmap.org"), "scanme.nmap.org");
});

test("normalizeDomain rejects anything that is not a public domain", () => {
  assert.equal(normalizeDomain("localhost"), null);
  assert.equal(normalizeDomain("myserver.local"), null);
  assert.equal(normalizeDomain("db.internal"), null);
  assert.equal(normalizeDomain("192.168.1.1"), null);
  assert.equal(normalizeDomain("::1"), null);
  assert.equal(normalizeDomain("justonelevel"), null);
  assert.equal(normalizeDomain("-bad.example.com"), null);
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain("*.example.com"), null);
});

test("private and reserved addresses are recognized", () => {
  for (const ip of [
    "10.0.0.1",
    "127.0.0.1",
    "172.16.0.9",
    "192.168.1.50",
    "169.254.10.10",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:192.168.0.1",
    "2001:db8::1",
  ]) {
    assert.equal(isPrivateAddress(ip), true, `${ip} must be private`);
  }
  for (const ip of ["1.1.1.1", "93.184.216.34", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(ip), false, `${ip} must be public`);
  }
});

test("scanme.nmap.org is the only preallowed target", () => {
  assert.equal(isPreallowed("scanme.nmap.org"), true);
  assert.equal(isPreallowed("example.com"), false);
});
