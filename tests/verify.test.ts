import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateToken,
  recordContainsToken,
  txtRecordName,
} from "../src/lib/verify";

test("generated tokens have the right shape", () => {
  const token = generateToken();
  assert.match(token, /^openports-verify=[0-9a-f]{32}$/, "token shape");
  assert.notEqual(token, generateToken(), "tokens must be random");
});

test("txt record name is the underscore subdomain", () => {
  assert.equal(txtRecordName("example.com"), "_openports.example.com");
});

test("record check accepts the token in any chunking", () => {
  const token = "openports-verify=abc123";
  assert.equal(recordContainsToken([[token]], token), true);
  // dns.resolveTxt splits long records into 255 byte chunks
  assert.equal(
    recordContainsToken([["openports-verify=", "abc123"]], token),
    true,
  );
  assert.equal(
    recordContainsToken([["openports-verify=other"]], token),
    false,
  );
  assert.equal(recordContainsToken([], token), false);
  assert.equal(
    recordContainsToken([["v=spf1 -all"], [token]], token),
    true,
    "must find the token among unrelated records",
  );
});
