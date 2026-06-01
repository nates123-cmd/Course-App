// Notion writeback payload-building (notion-writeback.js). Each writeback fn
// extracts the 32-hex page id from the notion_url, maps Course enums → Notion
// select names, and POSTs an update_page action to the course-notion-fetch edge
// fn. We intercept fetch and assert the REAL payload the shipped code builds —
// the part most likely to silently drift from Notion's property schema.
import { test, expect } from '@playwright/test';
import { boot, seedSession, recordFetch } from './helper.js';

const PID = 'a'.repeat(32); // a valid 32-hex Notion page id
const URL = `https://www.notion.so/Some-Page-${PID}`;

test.beforeEach(async ({ page }) => {
  await seedSession(page);
  await recordFetch(page); // capture every fetch; return {} 200
  await boot(page);
});

// Run a writeback then return the single edge-fn call it made.
async function callAndCapture(page, fn, args) {
  return page.evaluate(async ({ fn, args }) => {
    window.__calls = [];
    await window.notionWriteback[fn](...args);
    const c = window.__calls.find((x) => /course-notion-fetch/.test(x.url));
    return c || null;
  }, { fn, args });
}

test('projectStatus maps the enum and targets the page id', async ({ page }) => {
  const c = await callAndCapture(page, 'projectStatus', [URL, 'under_review']);
  expect(c).toBeTruthy();
  expect(c.method).toBe('POST');
  expect(c.body.action).toBe('update_page');
  expect(c.body.page_id).toBe(PID);
  expect(c.body.body.properties.Status.select.name).toBe('Under Review');
});

test('taskStatus sets both Task Status select AND the Complete checkbox', async ({ page }) => {
  const c = await callAndCapture(page, 'taskStatus', [URL, 'done']);
  const props = c.body.body.properties;
  expect(props['Task Status'].select.name).toBe('Done');
  expect(props.Complete.checkbox).toBe(true);
});

test('taskStatus with a non-done status leaves Complete false', async ({ page }) => {
  const c = await callAndCapture(page, 'taskStatus', [URL, 'next']);
  const props = c.body.body.properties;
  expect(props['Task Status'].select.name).toBe('Next');
  expect(props.Complete.checkbox).toBe(false);
});

test('taskStatus with blank status clears the select (select:null)', async ({ page }) => {
  const c = await callAndCapture(page, 'taskStatus', [URL, '']);
  const props = c.body.body.properties;
  expect(props['Task Status'].select).toBeNull();
  expect(props.Complete.checkbox).toBe(false);
});

test('projectDue with a date sends date.start; null clears it', async ({ page }) => {
  const withDate = await callAndCapture(page, 'projectDue', [URL, '2026-07-01']);
  expect(withDate.body.body.properties.Due.date.start).toBe('2026-07-01');
  const cleared = await callAndCapture(page, 'projectDue', [URL, null]);
  expect(cleared.body.body.properties.Due.date).toBeNull();
});

test('taskDoDate uses the "Do date" property name', async ({ page }) => {
  const c = await callAndCapture(page, 'taskDoDate', [URL, '2026-06-15']);
  expect(c.body.body.properties['Do date'].date.start).toBe('2026-06-15');
});

test('projectName writes a title rich-text block', async ({ page }) => {
  const c = await callAndCapture(page, 'projectName', [URL, 'Renamed']);
  expect(c.body.body.properties.Name.title[0].text.content).toBe('Renamed');
});

test('taskTitle uses the "Task" title property (not Name)', async ({ page }) => {
  const c = await callAndCapture(page, 'taskTitle', [URL, 'New title']);
  expect(c.body.body.properties.Task.title[0].text.content).toBe('New title');
  expect(c.body.body.properties.Name).toBeUndefined();
});

test('projectOutcome with text sends rich_text; empty sends []', async ({ page }) => {
  const withText = await callAndCapture(page, 'projectOutcome', [URL, 'Shipped']);
  expect(withText.body.body.properties.Outcome.rich_text[0].text.content).toBe('Shipped');
  const empty = await callAndCapture(page, 'projectOutcome', [URL, '']);
  expect(empty.body.body.properties.Outcome.rich_text).toEqual([]);
});

test('taskProject sets the relation to the target page id; null clears it', async ({ page }) => {
  const projUrl = `https://notion.so/Proj-${'b'.repeat(32)}`;
  const linked = await callAndCapture(page, 'taskProject', [URL, projUrl]);
  expect(linked.body.body.properties.Project.relation).toEqual([{ id: 'b'.repeat(32) }]);
  const cleared = await callAndCapture(page, 'taskProject', [URL, null]);
  expect(cleared.body.body.properties.Project.relation).toEqual([]);
});

test('NO-OP: a record with no notion_url makes no edge-fn call (Course-native)', async ({ page }) => {
  const c = await callAndCapture(page, 'projectStatus', [null, 'active']);
  expect(c).toBeNull();
});

test('NO-OP: a notion_url with no 32-hex id makes no edge-fn call', async ({ page }) => {
  const c = await callAndCapture(page, 'projectStatus', ['https://notion.so/no-id-here', 'active']);
  expect(c).toBeNull();
});

test('the call carries the Supabase bearer + content-type headers', async ({ page }) => {
  const c = await callAndCapture(page, 'projectName', [URL, 'X']);
  // headers are passed as a plain object to fetch in notion-writeback.js
  expect(c.headers['Content-Type']).toBe('application/json');
  expect(String(c.headers.Authorization || '')).toMatch(/^Bearer /);
});
