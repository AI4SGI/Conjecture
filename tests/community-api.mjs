import assert from "node:assert/strict";

const base = process.env.COMMUNITY_TEST_URL ?? "http://127.0.0.1:8787";
const clientKey = `test-${crypto.randomUUID()}`;
const sourceIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
const testAgent = `Community integration ${crypto.randomUUID()}`;
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
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": sourceIp,
      "User-Agent": testAgent,
    },
    body: JSON.stringify({ ...body, clientKey }),
  });
}

async function adminPost(body) {
  if (!process.env.COMMUNITY_ADMIN_KEY) throw new Error("COMMUNITY_ADMIN_KEY missing");
  return fetch(`${base}/api/community`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COMMUNITY_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function waitForAiResult(id) {
  let queue;
  let queued;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const queueResponse = await adminPost({ action: "admin_queue" });
    assert.equal(queueResponse.status, 200);
    queue = await queueResponse.json();
    queued = queue.messages.find((message) => message.id === id);
    if (queued?.aiReview?.status !== "pending") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { queue, queued };
}

const initial = await fetch(`${base}/api/community?sort=recent`).then((response) =>
  response.json(),
);
const bealFollowKey = "number_theory_001_beal_conjecture:P1";
assert.equal(typeof initial.traffic.total, "number");

const like = await post({ action: "like_task", conjecture: "number_theory_001_beal_conjecture", task: "P1" });
assert.equal(like.status, 200);
const duplicate = await post({ action: "like_task", conjecture: "number_theory_001_beal_conjecture", task: "P1" });
assert.equal(duplicate.status, 200);
assert.equal((await duplicate.json()).liked, false);
const relike = await post({ action: "like_task", conjecture: "number_theory_001_beal_conjecture", task: "P1" });
assert.equal(relike.status, 200);

const visit = await post({ action: "record_visit" });
assert.equal(visit.status, 200);
const visitResult = await visit.json();
assert.equal(typeof visitResult.traffic.total, "number");
const duplicateVisit = await post({ action: "record_visit" });
assert.equal(duplicateVisit.status, 200);
assert.equal((await duplicateVisit.json()).counted, false);

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
assert.equal(after.taskLikes[bealFollowKey], (initial.taskLikes[bealFollowKey] ?? 0) + 1);
assert.equal(after.pendingCount, initial.pendingCount + 1);
assert.equal(
  after.messages.some((message) => message.title === submissionTitle),
  false,
);
assert.equal(JSON.stringify(after).includes(contactEmail), false);

if (process.env.COMMUNITY_ADMIN_KEY) {
  let finalApproved = false;
  let { queue, queued } = await waitForAiResult(submissionResult.id);
  if (process.env.COMMUNITY_TEST_EXPECT_AI_FAILURE) {
    assert.equal(queued?.aiReview?.status, "failed");
    const retry = await adminPost({
      action: "retry_ai_review",
      id: submissionResult.id,
    });
    assert.equal(retry.status, 200);
    ({ queue, queued } = await waitForAiResult(submissionResult.id));
    assert.equal(queued?.aiReview?.status, "failed");
    assert.match(queued.aiReview.error, /^ai_review_(?:network|http_|base_url_)/);
    assert.match(queued.aiReview.requestStage, /^(?:configuration|failed)$/);
    assert.equal(queued.aiReview.attemptCount >= 2, true);
  }
  assert.equal(queue.storage.automaticDeletion, false);
  assert.equal(queue.storage.applicationCapacity, 10_000);
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
    finalApproved = true;
  } else if (queued.aiReview?.status === "failed") {
    assert.equal(moderation.status, 409);
    assert.equal((await moderation.json()).error, "ai_review_override_required");
    const shortOverride = await adminPost({
      action: "moderate",
      id: submissionResult.id,
      status: "approved",
      category: "research_question",
      reviewer: "API test moderator",
      note: "too short",
      overrideAiFailure: true,
    });
    assert.equal(shortOverride.status, 400);
    assert.equal((await shortOverride.json()).error, "override_note_required");
    const override = await fetch(`${base}/api/community`, {
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
        note: "AI failed; the human moderator independently completed all checks.",
        overrideAiFailure: true,
      }),
    });
    assert.equal(override.status, 200);
    assert.equal((await override.json()).aiOverride, true);
    finalApproved = true;
  } else {
    assert.equal(moderation.status, 409);
    assert.equal((await moderation.json()).error, "ai_review_required");
    const rejection = await fetch(`${base}/api/community`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.COMMUNITY_ADMIN_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "moderate",
        id: submissionResult.id,
        status: "rejected",
        category: "other",
        reviewer: "API test moderator",
        note: "Rejected while the AI provider was unavailable.",
      }),
    });
    assert.equal(rejection.status, 200);
  }

  if (finalApproved) {
    const missingRevisionNote = await adminPost({
      action: "moderate",
      id: submissionResult.id,
      status: "rejected",
      category: "other",
      reviewer: "Revision test moderator",
      note: "short",
      allowRevision: true,
    });
    assert.equal(missingRevisionNote.status, 400);
    assert.equal((await missingRevisionNote.json()).error, "revision_note_required");

    const withdraw = await adminPost({
      action: "moderate",
      id: submissionResult.id,
      status: "rejected",
      category: "other",
      reviewer: "Revision test moderator",
      note: "Withdrawn to verify reversible human moderation.",
      allowRevision: true,
    });
    assert.equal(withdraw.status, 200);
    const withdrawnPublic = await fetch(`${base}/api/community`).then((response) => response.json());
    assert.equal(withdrawnPublic.messages.some((message) => message.id === submissionResult.id), false);

    const republish = await adminPost({
      action: "moderate",
      id: submissionResult.id,
      status: "approved",
      category: "research_question",
      reviewer: "Revision test moderator",
      note: "Republished after a second complete human verification.",
      allowRevision: true,
      overrideAiFailure: queued.aiReview?.status === "failed",
    });
    assert.equal(republish.status, 200);
    const republishedPublic = await fetch(`${base}/api/community`).then((response) => response.json());
    assert.equal(republishedPublic.messages.some((message) => message.id === submissionResult.id), true);

    const revisedHistoryResponse = await adminPost({ action: "admin_queue", view: "reviewed" });
    const revisedHistory = await revisedHistoryResponse.json();
    const revised = revisedHistory.messages.find((message) => message.id === submissionResult.id);
    assert.equal(revised.humanReviewHistory.length >= 3, true);
    assert.equal(revised.humanReview.status, "approved");
  }

  const exportResponse = await fetch(`${base}/api/community`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COMMUNITY_ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "admin_export", offset: 0, limit: 1 }),
  });
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json();
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.messages.length, 1);
  assert.equal(exported.automaticDeletion, false);
}

const newConjecture = await post({
  action: "submit_message",
  nickname: "Problem Proposer",
  email: "proposer@example.org",
  title: "A new problem for community discussion " + crypto.randomUUID(),
  body: "This proposes a new mathematical problem before it enters the formal benchmark dataset.",
  conjecture: "new",
  task: "general",
  website: "",
  formStartedAt: Date.now() - 5_000,
});
assert.equal(newConjecture.status, 201);
const newConjectureResult = await newConjecture.json();

if (process.env.COMMUNITY_ADMIN_KEY) {
  const { queued } = await waitForAiResult(newConjectureResult.id);
  if (process.env.COMMUNITY_TEST_EXPECT_AI_FAILURE) {
    assert.equal(queued?.aiReview?.status, "failed");
  }
  const rejection = await adminPost({
    action: "moderate",
    id: newConjectureResult.id,
    status: "rejected",
    category: "other",
    reviewer: "API test moderator",
    note: "Rejected after independent human review.",
  });
  assert.equal(rejection.status, 200);
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
  "Community API: CORS, abuse controls, new-problem intake, AI/human fallback moderation, backup export and public projection passed.",
);
