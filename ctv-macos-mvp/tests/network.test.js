import assert from "node:assert/strict";
import test from "node:test";

import { fetchJsonResource, fetchTextResource } from "../src/network.js";

test("fetchTextResource returns successful response text", async () => {
  const calls = [];
  const text = await fetchTextResource("/measurements.csv", {
    fetchImpl: async (path) => {
      calls.push(path);
      return { ok: true, status: 200, text: async () => "channel,tone\nK,50" };
    },
  });

  assert.equal(text, "channel,tone\nK,50");
  assert.deepEqual(calls, ["/measurements.csv"]);
});

test("fetchTextResource rejects HTTP failures before parsing error pages", async () => {
  let bodyRead = false;
  await assert.rejects(
    fetchTextResource("/missing.csv", {
      label: "sample measurement",
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        text: async () => {
          bodyRead = true;
          return "<html>not found</html>";
        },
      }),
    }),
    /Cannot load sample measurement: HTTP 404/
  );
  assert.equal(bodyRead, false);
});

test("fetch resources preserve transport and JSON parsing context", async () => {
  await assert.rejects(
    fetchTextResource("/offline.csv", {
      label: "measurement API",
      fetchImpl: async () => {
        throw new Error("network offline");
      },
    }),
    /Cannot load measurement API: network offline/
  );

  await assert.rejects(
    fetchJsonResource("/broken.json", {
      label: "project archive",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      }),
    }),
    /Cannot parse project archive as JSON: Unexpected token/
  );
});

test("fetchTextResource reports unavailable APIs and unreadable bodies", async () => {
  await assert.rejects(
    fetchTextResource("/measurement.csv", { fetchImpl: "missing" }),
    /Cannot load \/measurement.csv: Fetch API is unavailable/
  );

  await assert.rejects(
    fetchTextResource("/measurement.csv", {
      label: "measurement response",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("stream closed");
        },
      }),
    }),
    /Cannot read measurement response: stream closed/
  );
});
