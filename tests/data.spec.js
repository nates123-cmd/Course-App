// loadCourseData() is the REAL data transform (supabase-client.js): it fans out
// db.select() calls (which use fetch) and shapes rows via shapeTask/shapeProject.
// We stub fetch per-table to feed fixture rows, then assert the shaped registry +
// pillar grouping. This exercises the shipped shapers (private to the IIFE) plus
// the null-pillar handling that a past Triage bug regressed.
import { test, expect } from '@playwright/test';
import { boot, seedSession } from './helper.js';

// Install a route-aware fetch BEFORE boot. Matches the PostgREST path segment
// (…/rest/v1/<table>?…) and returns the matching fixture array as JSON.
async function stubTables(page, tables) {
  await page.addInitScript((fixtures) => {
    window.fetch = async (url) => {
      const u = String(url);
      let rows = [];
      for (const [name, data] of Object.entries(fixtures)) {
        // db.select builds `/rest/v1/<table>?<query>` — match on the table segment.
        if (new RegExp(`/${name}(\\?|$)`).test(u)) { rows = data; break; }
      }
      return new Response(JSON.stringify(rows), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    };
  }, tables);
}

test('loadCourseData shapes a project + its tasks (real shapers)', async ({ page }) => {
  await seedSession(page);
  await stubTables(page, {
    course_projects: [{
      id: 'p1', name: 'Hire designer', pillar: 'Arrow', work_area: 'Hiring',
      status: 'active', sort_order: 1000, due_date: '2026-07-04',
      outcome: 'Signed offer', notion_url: 'https://notion.so/abc' + '0'.repeat(29),
    }],
    course_tasks: [
      { id: 't1', project_id: 'p1', title: 'Post JD', status: 'next', sort_order: 1000, do_date: '2026-06-02' },
      { id: 't2', project_id: 'p1', title: 'Screen', status: 'waiting', person_dependency: 'Cedric' },
      { id: 't3', project_id: 'p1', title: 'Done thing', status: 'done' },
    ],
    course_status_notes: [],
    course_milestones: [],
    course_captures: [],
  });
  await boot(page);

  const data = await page.evaluate(() => window.loadCourseData());
  const p = data.registry.p1;
  expect(p.name).toBe('Hire designer');
  expect(p.pillar).toBe('arrow');               // lowercased
  expect(p.pillarLabel).toBe('Arrow · Hiring');  // label + work_area joined
  expect(p.status).toBe('active');
  expect(p.due).toEqual({ m: 6, d: 4, y: 2026 }); // July = month index 6
  expect(p.dod).toBe('Signed offer');
  expect(p.initialTasks).toHaveLength(3);

  const t1 = p.initialTasks.find((t) => t.id === 't1');
  expect(t1.label).toBe('Post JD');
  expect(t1.next).toBe(true);
  expect(t1.due).toBe('2026-06-02');
  const t2 = p.initialTasks.find((t) => t.id === 't2');
  expect(t2.waiting).toBe('Cedric'); // person_dependency surfaced
  const t3 = p.initialTasks.find((t) => t.id === 't3');
  expect(t3.done).toBe(true);

  expect(data.projectIds).toContain('p1');
});

test('REGRESSION: an active project with NULL pillar is still returned', async ({ page }) => {
  // The past bug dropped null-pillar active projects from Triage. loadCourseData
  // must still include it (pillar shaped to null, not lost); Triage groups it
  // under "unfiled" via `p.pillar || 'unfiled'`.
  await seedSession(page);
  await stubTables(page, {
    course_projects: [
      { id: 'pnull', name: 'Unfiled work', pillar: null, status: 'active' },
      { id: 'pblank', name: 'Blank pillar', pillar: '', status: 'active' },
    ],
    course_tasks: [],
    course_status_notes: [],
    course_milestones: [],
    course_captures: [],
  });
  await boot(page);

  const res = await page.evaluate(() => window.loadCourseData());
  expect(res.registry.pnull).toBeTruthy();
  expect(res.registry.pnull.pillar).toBeNull();
  expect(res.registry.pnull.status).toBe('active');
  expect(res.registry.pblank.pillar).toBeNull(); // '' → null, never dropped
  expect(res.projectIds).toEqual(expect.arrayContaining(['pnull', 'pblank']));
});

test('REGRESSION: Triage grouping keeps null-pillar active projects (under "unfiled")', async ({ page }) => {
  // Re-implements ONLY the grouping key the app uses (`p.pillar || 'unfiled'`)
  // over the REAL shaped registry, to prove a null-pillar active project lands
  // in a visible bucket rather than vanishing. The shaping is real; we assert
  // the bucket the app's own grouping (triage.jsx) computes.
  await seedSession(page);
  await stubTables(page, {
    course_projects: [
      { id: 'pn', name: 'No pillar', pillar: null, status: 'active' },
      { id: 'pa', name: 'Arrow proj', pillar: 'arrow', status: 'active' },
    ],
    course_tasks: [],
    course_status_notes: [],
    course_milestones: [],
    course_captures: [],
  });
  await boot(page);

  const grouped = await page.evaluate(() => {
    return window.loadCourseData().then((data) => {
      const g = {};
      for (const p of Object.values(data.registry)) {
        if (window.bucketFor(p.status) === 'hidden') continue;
        const pid = p.pillar || 'unfiled';
        (g[pid] ||= { active: [], onhold: [], idea: [] })[window.bucketFor(p.status)].push(p.id);
      }
      return g;
    });
  });
  expect(grouped.unfiled).toBeTruthy();
  expect(grouped.unfiled.active).toContain('pn');
  expect(grouped.arrow.active).toContain('pa');
});

test('loadCourseData groups project-less pillar tasks by lowercased pillar', async ({ page }) => {
  await seedSession(page);
  await stubTables(page, {
    course_projects: [],
    course_tasks: [
      { id: 'lt1', project_id: null, title: 'Loose A', status: 'next', pillar: 'Sunny' },
      { id: 'lt2', project_id: null, title: 'Loose B', status: 'triage', pillar: 'sunny' },
      { id: 'lt3', project_id: null, title: 'No pillar loose', status: 'triage', pillar: null },
    ],
    course_status_notes: [],
    course_milestones: [],
    course_captures: [],
  });
  await boot(page);

  const pt = await page.evaluate(() => window.loadCourseData().then((d) => d.pillarTasks));
  expect(pt.sunny).toHaveLength(2); // both 'Sunny' and 'sunny' collapse
  expect(pt.sunny.map((t) => t.id).sort()).toEqual(['lt1', 'lt2']);
  // A project-less task with no pillar is neither a pillar task nor a project task.
  const allIds = Object.values(pt).flat().map((t) => t.id);
  expect(allIds).not.toContain('lt3');
});
