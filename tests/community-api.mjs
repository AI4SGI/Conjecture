import assert from "node:assert/strict";

const base = process.env.COMMUNITY_TEST_URL ?? "http://127.0.0.1:8787";
const clientKey = `test-${crypto.randomUUID()}`;
const allowedOrigin = "https://ai4sgi.github.io";

const preflight = await fetch(`${base}/api/community`, {
  method: "OPTIONS",
  headers: {
    Origin: allowedOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
});
assert.equal(preflight.status, 204);
assert.equal(
  preflight.headers.get("access-control-allow-origin"),
  allowedOrigin,
);

const rejectedOrigin = await fetch(`${base}/api/community`, {
  headers: { Origin: "https://example.invalid" },
});
assert.equal(rejectedOrigin.status, 403);

async function post(body) {
  return fetch(`${base}/api/community`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, clientKey }),
  });
}

const initial = await fetch(`${base}/api/community?sort=recent`).then((response) =>
  response.json(),
);
assert.equal(typeof initial.taskLikes.P1, "number");

const like = await post({ action: "like_task", task: "P1" });
assert.equal(like.status, 200);
const duplicate = await post({ action: "like_task", task: "P1" });
assert.equal(duplicate.status, 409);

const submission = await post({
  action: "submit_message",
  nickname: "Test Researcher",
  title: "A verifiable benchmark question",
  body: "This pending message must remain invisible until moderation approves it.",
  conjecture: "number_theory_001_beal_conjecture",
  task: "P3",
});
assert.equal(submission.status, 201);
const submissionResult = await submission.json();

const unauthorizedModeration = await fetch(`${base}/api/community`, {
  method: "POST",
  headers: {
    Authorization: "Bearer incorrect-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "moderate",
    id: submissionResult.id,
    status: "approved",
  }),
});
assert.equal(unauthorizedModeration.status, 401);

const after = await fetch(`${base}/api/community?sort=popular`).then((response) =>
  response.json(),
);
assert.equal(after.taskLikes.P1, initial.taskLikes.P1 + 1);
assert.equal(after.pendingCount, initial.pendingCount + 1);
assert.equal(
  after.messages.some((message) => message.title === "A verifiable benchmark question"),
  false,
);

if (process.env.COMMUNITY_ADMIN_KEY) {
  const moderation = await fetch(`${base}/api/community`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COMMUNITY_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "moderate",
      id: submissionResult.id,
      status: "approved",
    }),
  });
  assert.equal(moderation.status, 200);
  const approved = await fetch(`${base}/api/community`).then((response) =>
    response.json(),
  );
  assert.equal(
    approved.messages.some(
      (message) => message.title === "A verifiable benchmark question",
    ),
    true,
  );
}

console.log(
  "Community API: CORS, like de-duplication, moderation auth and queue passed.",
);
