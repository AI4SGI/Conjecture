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
assert.equal(duplicate.status, 200);
assert.equal((await duplicate.json()).liked, false);
const relike = await post({ action: "like_task", task: "P1" });
assert.equal(relike.status, 200);

const submissionMarker = crypto.randomUUID();
const submissionTitle = "A verifiable benchmark question " + submissionMarker;
const contactEmail = "community-test@example.org";
const invalidEmail = await post({
  action: "submit_message",
  nickname: "Test Researcher",
  email: "not-an-email",
  title: "This email must be rejected",
  body: "The server must validate contact email independently of the browser.",
  conjecture: "number_theory_001_beal_conjecture",
  task: "P1",
  website: "",
  formStartedAt: Date.now() - 5_000,
});
assert.equal(invalidEmail.status, 400);
assert.equal((await invalidEmail.json()).error, "invalid_email");

const submission = await post({
  action: "submit_message",
  nickname: "Test Researcher",
  email: contactEmail,
  title: submissionTitle,
  body: "This pending message " + submissionMarker + " must remain invisible until AI and human moderation approve it.",
  conjecture: "number_theory_001_beal_conjecture",
  task: "P1",
  website: "",
  formStartedAt: Date.now() - 5_000,
});
assert.equal(submission.status, 201);
const submissionResult = await submission.json();
assert.equal(submissionResult.status, "ai_pending");
assert.match(submissionResult.submittedAt, /^\d{4}-\d{2}-\d{2}T/);

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
  after.messages.some((message) => message.title === submissionTitle),
  false,
);
assert.equal(JSON.stringify(after).includes(contactEmail), false);

if (process.env.COMMUNITY_ADMIN_KEY) {
  const queueResponse = await fetch(`${base}/api/community`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COMMUNITY_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "admin_queue",
    }),
  });
  assert.equal(queueResponse.status, 200);
  const queue = await queueResponse.json();
  const queued = queue.messages.find((message) => message.id === submissionResult.id);
  assert(queued, "submitted message must enter the private moderation queue");
  assert.match(queued.submittedDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(queued.submittedTime, /^\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(queued.contactEmail, contactEmail);

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
      category: "research_question",
      reviewer: "API test moderator",
    }),
  });
  if (queued.aiReview?.status === "completed") {
    assert.equal(moderation.status, 200);
    const approved = await fetch(`${base}/api/community`).then((response) =>
      response.json(),
    );
    const published = approved.messages.find(
      (message) => message.title === submissionTitle,
    );
    assert(published);
    assert.equal(published.category, "research_question");
    assert.equal(published.aiScreened, true);
    assert.equal(published.humanApproved, true);
    assert.equal(published.contactEmail, undefined);

    const historyResponse = await fetch(`${base}/api/community`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.COMMUNITY_ADMIN_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "admin_queue", view: "reviewed" }),
    });
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    const reviewed = history.messages.find((message) => message.id === submissionResult.id);
    assert.equal(reviewed.status, "approved");
    assert.equal(reviewed.contactEmail, contactEmail);
    assert.equal(reviewed.humanReview.reviewer, "API test moderator");
  } else {
    assert.equal(moderation.status, 409);
    assert.equal((await moderation.json()).error, "ai_review_required");
  }
}

const honeypotBefore = await fetch(`${base}/api/community`).then((response) =>
  response.json(),
);
const honeypot = await post({
  action: "submit_message",
  nickname: "Automated",
  email: "automated@example.org",
  title: "This should be silently discarded",
  body: "A bot-filled hidden field must never enter persistent moderation data.",
  conjecture: "jacobian_conjecture",
  task: "general",
  website: "https://spam.invalid",
  formStartedAt: Date.now() - 5_000,
});
assert.equal(honeypot.status, 201);
const honeypotAfter = await fetch(`${base}/api/community`).then((response) =>
  response.json(),
);
assert.equal(honeypotAfter.pendingCount, honeypotBefore.pendingCount);

console.log(
  "Community API: CORS, layered abuse controls, AI gate, human moderation and public projection passed.",
);
