import assert from "node:assert/strict";
import { test } from "node:test";
import { AnswerSync } from "../lib/answer-sync";
import { answersMatchExactly, mathAnswerToText } from "../lib/math-answer";

test("typing during save preserves the latest value and serializes batches", async () => {
  let accept!: (revision: number) => void;
  const sent: { values: { answer: string }[]; revision: number }[] = [];
  const sync = new AnswerSync(0, async (values, revision) => {
    sent.push({ values, revision });
    if (sent.length === 1) return new Promise<number>((resolve) => { accept = resolve; });
    return revision + 1;
  }, () => {});
  sync.update("q1", "first");
  const saving = sync.flush();
  sync.update("q1", "latest");
  sync.update("q2", "another answer");
  const secondFlush = sync.flush();
  assert.equal(sent.length, 1);
  accept(1);
  await Promise.all([saving, secondFlush]);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].revision, 1);
  assert.equal(sent[1].values[0].answer, "latest");
  assert.equal(sync.size, 0);
  assert.equal(sync.revision, 2);
});

test("failed save retains draft; retry uses the same revision", async () => {
  let failing = true;
  const sync = new AnswerSync(7, async (_, revision) => {
    assert.equal(revision, 7);
    if (failing) throw new Error("offline");
    return 8;
  }, () => {});
  sync.update("q", "preserved");
  await assert.rejects(sync.flush(), /offline/);
  assert.equal(sync.size, 1);
  assert.equal(sync.revision, 7);
  failing = false;
  await sync.flush();
  assert.equal(sync.size, 0);
});

test("drafts from a different server revision cannot overwrite saved answers", () => {
  const sync = new AnswerSync(3, async () => 4, () => {});
  assert.equal(sync.restore({ revision: 2, answers: { q: "old" } }), false);
  assert.equal(sync.size, 0);
  assert.equal(sync.restore({ revision: 3, answers: { q: "pending" } }), true);
  assert.equal(sync.snapshot()[0].answer, "pending");
});

test("ordinary keyboard notation matches legacy math without changing expression meaning", () => {
  for (const [key, value] of [["\\(\\frac{1}{2}\\)", "1/2"], ["\\(\\frac{1}{2}\\)", "0.5"],
    ["\\(\\sqrt{9}\\)", "sqrt(9)"], ["\\(x^{2}\\)", "x^2"], ["\\(2 \\times 3\\)", "6"], ["\\(1.5\\)", "1,5"]]) {
    assert.equal(answersMatchExactly(key, value), true, `${key} vs ${value}`);
  }
  for (const [key, value] of [["\\(x\\)", "X"], ["\\(\\frac{a+b}{c}\\)", "a+b/c"],
    ["\\(x^2\\)", "x^3"], ["\\(1\\)", "1/0"], ["\\(2\\)", "process.exit()"], ["\\(-2^2\\)", "4"]]) {
    assert.equal(answersMatchExactly(key, value), false, `${key} vs ${value}`);
  }
  assert.equal(answersMatchExactly("Jakarta", " jakarta "), true);
  assert.equal(mathAnswerToText("\\(\\sqrt{9}\\)"), "sqrt(9)");
});
