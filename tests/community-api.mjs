import assert from "node:assert/strict";

const base = process.env.COMMUNITY_TEST_URL ?? "http://127.0.0.1:8787";
const clientKey = `test-${crypto.randomUUID()}`;

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
  task: "P3",
});
assert.equal(submission.status, 201);

const after = await fetch(`${base}/api/community?sort=popular`).then((response) =>
  response.json(),
);
assert.equal(after.taskLikes.P1, initial.taskLikes.P1 + 1);
assert.equal(after.pendingCount, initial.pendingCount + 1);
assert.equal(
  after.messages.some((message) => message.title === "A verifiable benchmark question"),
  false,
);

console.log("Community API: like de-duplication and moderation queue passed.");
