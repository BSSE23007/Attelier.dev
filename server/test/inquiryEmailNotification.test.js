import test from "node:test";
import assert from "node:assert/strict";
import { createInquiryHandler, inquirySchema } from "../src/controllers/inquiryController.js";
import { createInquiryEmailNotifier } from "../src/services/inquiryEmailNotification.js";

const validInquiry = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  service: "Web Development",
  message: "I would like to discuss a new website project.",
};

const savedInquiry = {
  ...validInquiry,
  _id: "inquiry-123",
  createdAt: new Date("2026-11-05T06:30:00.000Z"),
};

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function submit(handler, body = validInquiry) {
  const res = responseRecorder();
  await handler({ body }, res);
  return res;
}

function makeMockClient(send) {
  return { emails: { send } };
}

const configuredEnv = {
  EMAIL_PROVIDER_API_KEY: "re_test_secret",
  EMAIL_FROM: "Attelier.dev <notifications@example.com>",
  CLIENT_ORIGIN: "https://atelier.example.test",
};

test("persists inquiry before sending notification with configured address and details", async () => {
  const order = [];
  let mail;
  const notify = createInquiryEmailNotifier({
    env: configuredEnv,
    createClient(apiKey) {
      assert.equal(apiKey, configuredEnv.EMAIL_PROVIDER_API_KEY);
      return makeMockClient(async (payload) => {
        order.push("send");
        mail = payload;
        return { data: { id: "email-id" }, error: null };
      });
    },
  });
  const handler = createInquiryHandler({
    async persistInquiry(data) {
      order.push("persist");
      assert.deepEqual(data, validInquiry);
      return savedInquiry;
    },
    notifyInquiry: notify,
  });

  const res = await submit(handler);

  assert.deepEqual(order, ["persist", "send"]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    message: "Your project inquiry has been received!",
    inquiryId: "inquiry-123",
  });
  assert.equal(mail.to, "attelier.dev@gmail.com");
  assert.equal(mail.from, configuredEnv.EMAIL_FROM);
  assert.equal(mail.subject, "New inquiry received — Attelier.dev");
  assert.match(mail.text, /Ada Lovelace/);
  assert.match(mail.text, /ada@example\.com/);
  assert.match(mail.text, /Web Development/);
  assert.match(mail.text, /2026-11-05T06:30:00\.000Z/);
  assert.match(mail.text, /I would like to discuss a new website project\./);
  assert.match(mail.html, /Ada Lovelace/);
  assert.match(mail.html, /ada@example\.com/);
  assert.match(mail.html, /Web Development/);
});

test("escapes untrusted HTML content and builds the detail URL from CLIENT_ORIGIN", async () => {
  let mail;
  const notify = createInquiryEmailNotifier({
    env: configuredEnv,
    createClient: () => makeMockClient(async (payload) => {
      mail = payload;
      return { data: { id: "email-id" }, error: null };
    }),
  });
  const hostileInquiry = {
    ...savedInquiry,
    name: '<img src=x onerror="x"> & Ada',
    message: '<script>alert("x")</script> & details',
  };

  await notify(hostileInquiry);

  assert.match(mail.html, /&lt;img src=x onerror=&quot;x&quot;&gt; &amp; Ada/);
  assert.match(mail.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; details/);
  assert.doesNotMatch(mail.html, /<script>|<img /);
  assert.match(mail.text, /<script>alert\("x"\)<\/script> & details/);
  assert.match(mail.html, /href="https:\/\/atelier\.example\.test\/admin\/inquiries\/inquiry-123"/);
  assert.match(mail.text, /https:\/\/atelier\.example\.test\/admin\/inquiries\/inquiry-123/);
});

test("truncates the message preview", async () => {
  let mail;
  const notify = createInquiryEmailNotifier({
    env: configuredEnv,
    createClient: () => makeMockClient(async (payload) => {
      mail = payload;
      return { data: { id: "email-id" }, error: null };
    }),
  });
  await notify({ ...savedInquiry, message: "M".repeat(450) });
  assert.equal(mail.text.split("Message preview:\n")[1].split("\n")[0].length, 300);
  assert.match(mail.html, /M{300}/);
  assert.doesNotMatch(mail.html, /M{301}/);
});

test("missing API key skips provider client creation and sending", async () => {
  let clientCreations = 0;
  const notify = createInquiryEmailNotifier({
    env: { ...configuredEnv, EMAIL_PROVIDER_API_KEY: "" },
    createClient: () => { clientCreations += 1; return makeMockClient(async () => ({})); },
  });
  assert.deepEqual(await notify(savedInquiry), { sent: false, reason: "configuration" });
  assert.equal(clientCreations, 0);
});

test("missing sender skips provider client creation and sending", async () => {
  let clientCreations = 0;
  const notify = createInquiryEmailNotifier({
    env: { ...configuredEnv, EMAIL_FROM: " " },
    createClient: () => { clientCreations += 1; return makeMockClient(async () => ({})); },
  });
  assert.deepEqual(await notify(savedInquiry), { sent: false, reason: "configuration" });
  assert.equal(clientCreations, 0);
});

test("invalid sender skips provider client creation and sending", async () => {
  let clientCreations = 0;
  const notify = createInquiryEmailNotifier({
    env: { ...configuredEnv, EMAIL_FROM: "attelier.dev@gmail.com\\r\\nBcc: attacker@example.com" },
    createClient: () => { clientCreations += 1; return makeMockClient(async () => ({})); },
  });
  assert.deepEqual(await notify(savedInquiry), { sent: false, reason: "configuration" });
  assert.equal(clientCreations, 0);
});

test("provider errors do not change the successful inquiry response or leak provider details", async () => {
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logged.push(args);
  const testKey = ["test", "credential"].join("-");
  const secret = `${testKey}-must-not-be-logged`;
  const providerMessage = `sensitive provider response ${secret}`;
  try {
    const notify = createInquiryEmailNotifier({
      env: { ...configuredEnv, EMAIL_PROVIDER_API_KEY: secret },
      createClient: () => makeMockClient(async () => ({
        data: null,
        error: { name: "invalid_api_key", message: providerMessage, response: providerMessage },
      })),
    });
    const handler = createInquiryHandler({
      persistInquiry: async () => savedInquiry,
      notifyInquiry: notify,
    });
    const res = await submit(handler);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "[InquiryEmailNotificationFailed]");
    assert.doesNotMatch(JSON.stringify(logged), new RegExp(testKey));
    assert.doesNotMatch(JSON.stringify(logged), new RegExp(secret));
    assert.doesNotMatch(JSON.stringify(logged), new RegExp(providerMessage));
  } finally {
    console.error = originalConsoleError;
  }
});

test("provider timeout aborts the SDK request and preserves HTTP 201", async () => {
  let wasAborted = false;
  const notify = createInquiryEmailNotifier({
    env: configuredEnv,
    timeoutMs: 10,
    logger: () => {},
    createClient: () => makeMockClient((payload, { signal }) => new Promise((resolve, reject) => {
      assert.ok(payload.subject);
      signal.addEventListener("abort", () => {
        wasAborted = true;
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })),
  });
  const handler = createInquiryHandler({
    persistInquiry: async () => savedInquiry,
    notifyInquiry: notify,
  });

  const res = await submit(handler);
  assert.equal(wasAborted, true);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
});

test("unexpected notification exceptions are caught locally after persistence", async () => {
  const handler = createInquiryHandler({
    persistInquiry: async () => savedInquiry,
    notifyInquiry: async () => { throw new Error("provider secret must not escape"); },
  });
  const res = await submit(handler);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.inquiryId, "inquiry-123");
});

test("persistence failure prevents notification", async () => {
  let notificationCalls = 0;
  const handler = createInquiryHandler({
    persistInquiry: async () => { throw new Error("database unavailable"); },
    notifyInquiry: async () => { notificationCalls += 1; },
  });
  const res = await submit(handler);
  assert.equal(res.statusCode, 500);
  assert.equal(notificationCalls, 0);
});

test("existing inquiry validation remains unchanged and does not notify invalid input", async () => {
  let notificationCalls = 0;
  let persistenceCalls = 0;
  const handler = createInquiryHandler({
    persistInquiry: async () => { persistenceCalls += 1; return savedInquiry; },
    notifyInquiry: async () => { notificationCalls += 1; },
  });
  const invalid = { ...validInquiry, message: "short" };
  const res = await submit(handler, invalid);

  assert.equal(res.statusCode, 400);
  assert.equal(notificationCalls, 0);
  assert.equal(persistenceCalls, 0);
  assert.equal(inquirySchema.safeParse(invalid).success, false);
  assert.deepEqual(inquirySchema.parse(validInquiry), validInquiry);
});
