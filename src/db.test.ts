import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addExpressionRecord, closeExpressionDatabase, deleteExpressionRecord, EXPRESSION_DB_NAME, getAllExpressionRecords, updateExpressionRecord } from "./db";
import type { ExpressionRecord } from "./records";

const record: ExpressionRecord = {
  id: "record-1",
  originalSentence: "I'm on the fence about it.",
  sentenceTranslationZh: "我对此还在犹豫。",
  expression: "be on the fence",
  meaningZh: "犹豫不决",
  meaningInContextZh: "这里表示尚未做决定。",
  usageZh: "用于两种选择之间还没拿定主意时。",
  expressionType: "idiom",
  naturalness: "very_natural",
  semanticGroup: "UNDECIDED",
  sceneTags: ["Daily Conversation"],
  alternatives: [{ expression: "be undecided", meaningZh: "尚未决定" }],
  sourceType: "web",
  sourceUrl: "https://example.com",
  capturedAt: "2026-09-05T08:00:00.000Z",
  createdAt: "2026-09-05T08:01:00.000Z",
  updatedAt: "2026-09-05T08:01:00.000Z",
  userEdited: false,
};

async function deleteTestDatabase() {
  await closeExpressionDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(EXPRESSION_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

beforeEach(deleteTestDatabase);
afterEach(deleteTestDatabase);

describe("expression IndexedDB", () => {
  it("persists a record after the database connection is closed and reopened", async () => {
    await addExpressionRecord(record);
    await closeExpressionDatabase();
    expect(await getAllExpressionRecords()).toEqual([record]);
  });

  it("updates editable data without changing creation or capture timestamps", async () => {
    await addExpressionRecord(record);
    const edited = { ...record, meaningZh: "拿不定主意", updatedAt: "2026-09-05T09:00:00.000Z", userEdited: true };
    await updateExpressionRecord(edited);
    expect((await getAllExpressionRecords())[0]).toEqual(edited);
    expect(edited.createdAt).toBe(record.createdAt);
    expect(edited.capturedAt).toBe(record.capturedAt);
  });

  it("deletes a saved record", async () => {
    await addExpressionRecord(record);
    await deleteExpressionRecord(record.id);
    expect(await getAllExpressionRecords()).toEqual([]);
  });

  it("rejects a duplicate id instead of overwriting the first record", async () => {
    await addExpressionRecord(record);
    await expect(addExpressionRecord({ ...record, meaningZh: "duplicate" })).rejects.toBeTruthy();
    expect(await getAllExpressionRecords()).toEqual([record]);
  });

  it("stores three candidates from one sentence as independent records with shared source metadata", async () => {
    const expressions = ["a piece of cake", "easier said than done", "the tip of the iceberg"];
    await Promise.all(expressions.map((expression, index) => addExpressionRecord({
      ...record,
      id: `candidate-${index}`,
      expression,
      sourceTitle: "Shared source",
    })));
    const saved = await getAllExpressionRecords();
    expect(saved.map((item) => item.expression).sort()).toEqual([...expressions].sort());
    expect(new Set(saved.map((item) => item.id)).size).toBe(3);
    expect(new Set(saved.map((item) => item.originalSentence)).size).toBe(1);
    expect(new Set(saved.map((item) => item.sourceUrl)).size).toBe(1);
    expect(new Set(saved.map((item) => item.capturedAt)).size).toBe(1);
  });
});
