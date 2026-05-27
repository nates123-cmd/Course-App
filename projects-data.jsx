// Project content registry — keyed by id used in triage cards/idea rows.

// Seed status timestamps relative to today.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const PROJECTS = {
  casablanca: {
    name: 'Casablanca lease',
    pillar: 'arrow',
    pillarLabel: 'Arrow · Hiring',
    status: 'active',
    due: { m: 5, d: 14, y: 2026 },
    latest:
      "Cedric has the lease terms in his court — final clauses need legal review before we sign. Move-in date is loosely targeted at mid-June. Logistics for the team relocation are still open: nothing booked yet.",
    dod: "Lease signed, move-in date locked, and the first three people relocated.",
    stamp: "Synthesized from 4 Notion notes · refreshed 5h ago",
    statusSeed: [
      {
        id: 'sc1',
        body: "Cedric's response on the indemnity clause is the gating item. Pushing to lock signature by end of next week — anything beyond that and the move-in window starts slipping.",
        createdAt: daysAgo(2),
        source: 'manual',
      },
      {
        id: 'sc2',
        body: "Legal review pulled in unexpected scope around the parking allocation. Could be a 1-week drag.",
        createdAt: daysAgo(8),
        source: 'manual',
      },
      {
        id: 'sc3',
        body: "Site walk went well. Layout works for the way the team operates.",
        createdAt: daysAgo(21),
        source: 'manual',
      },
    ],
    notion: { pages: 4, editedAgo: '5h ago' },
    milestones: [
      { state: 'done',     label: 'Site selected',           sub: 'Apr 22' },
      { state: 'done',     label: 'Lease terms drafted',     sub: 'May 9' },
      { state: 'current',  label: 'Legal review & signing',  sub: 'in progress' },
      { state: 'upcoming', label: 'Team move-in' },
    ],
    initialTasks: [
      { id: 't0', label: 'Email Cedric re lease terms', done: true },
      { id: 't1', label: 'Confirm move-in date' },
      { id: 't2', label: 'Review contract clauses', waiting: 'legal' },
    ],
    riffSeed:
      "Lease is mostly there. Cedric needs to come back on the indemnity clauses. We probably want to lock in move-in for mid-June so the first wave has time to settle before kickoff.",
  },

  ecs: {
    name: 'ECS quarterly review',
    pillar: 'arrow',
    pillarLabel: 'Arrow · ECS',
    status: 'active',
    due: { m: 5, d: 30, y: 2026 },
    latest:
      "Quarterly review is overdue. Last touch was 14 days ago. Leadership expects a summary doc before the end of the quarter; nothing has been drafted yet.",
    dod: "Summary doc shipped to leadership, with the two outstanding decisions called out.",
    stamp: "Stalled · last activity 14d ago",
    statusSeed: [
      {
        id: 'sec1',
        body: "Honestly avoiding this. The draft requires me to take a position on the two open decisions and I haven't done the thinking yet.",
        createdAt: daysAgo(5),
        source: 'think_it_through',
      },
      {
        id: 'sec2',
        body: "Pulled the metrics. Numbers are decent. Nothing alarming, nothing to brag about.",
        createdAt: daysAgo(16),
        source: 'manual',
      },
    ],
    notion: { pages: 2, editedAgo: '14d ago' },
    milestones: [
      { state: 'done',     label: 'Q1 metrics pulled',         sub: 'Apr 30' },
      { state: 'current',  label: 'Summary doc',               sub: '0% drafted' },
      { state: 'upcoming', label: 'Leadership review' },
    ],
    initialTasks: [
      { id: 't0', label: 'Draft summary document' },
      { id: 't1', label: 'Send to leadership' },
    ],
    riffSeed:
      "Need to write up Q1 — wins, misses, and the two decisions that have been sitting. Frame it so leadership doesn't have to ask follow-ups.",
  },

  morocco: {
    name: 'Morocco hiring expansion',
    pillar: 'arrow',
    pillarLabel: 'Arrow · Hiring',
    status: 'active',
    due: { m: 6, d: 15, y: 2026 },
    latest:
      "Org chart for the Casablanca team is set. Job descriptions are next — three senior roles need to go up first. Sourcing pipeline is empty.",
    dod: "Three senior hires made, with team able to onboard before Q4 push.",
    stamp: "Synthesized from 6 docs · refreshed 1d ago",
    statusSeed: [
      {
        id: 'sm1',
        body: "Three senior roles defined. Pipeline is the bottleneck — we don't have a sourcer and outbound is patchy.",
        createdAt: daysAgo(3),
        source: 'manual',
      },
      {
        id: 'sm2',
        body: "Decided to hire a contractor sourcer for the first 6 weeks rather than wait for the in-house hire.",
        createdAt: daysAgo(10),
        source: 'manual',
      },
    ],
    notion: { pages: 6, editedAgo: '1d ago' },
    milestones: [
      { state: 'done',     label: 'Org chart defined',     sub: 'May 12' },
      { state: 'current',  label: 'Senior roles posted',   sub: '0 of 3' },
      { state: 'upcoming', label: 'First 3 hires made' },
      { state: 'upcoming', label: 'Onboarding' },
    ],
    initialTasks: [
      { id: 't0', label: 'Post job descriptions' },
      { id: 't1', label: 'Define org chart', done: true },
      { id: 't2', label: 'Reach out to 5 candidates Marta flagged' },
    ],
    riffSeed:
      "Three senior posts first — Eng manager, Ops lead, design lead. Need JDs from the existing ones we used in Berlin, then localize.",
  },

  vendor: {
    name: 'Vendor system upgrade',
    pillar: 'arrow',
    pillarLabel: 'Arrow · Infra',
    status: 'on-hold',
    due: { m: 7, d: 1, y: 2026 },
    holdReason: 'Waiting on AWS pricing — Marcus owns it',
    holdCheckIn: '2026-05-24',
    latest:
      "Architecture proposal is ready. Procurement is blocked until AWS comes back with negotiated pricing — Marcus is chasing.",
    dod: "Contract signed and migration plan locked.",
    stamp: "Blocked · check in tomorrow",
    milestones: [
      { state: 'done',     label: 'Architecture proposal',   sub: 'May 14' },
      { state: 'current',  label: 'Pricing negotiation',     sub: 'with AWS' },
      { state: 'upcoming', label: 'Contract sign-off' },
      { state: 'upcoming', label: 'Migration cutover' },
    ],
    initialTasks: [
      { id: 't0', label: 'Check in with Marcus on AWS pricing' },
    ],
    riffSeed: "If Marcus doesn't have pricing by Friday, we escalate to the AWS account team. Don't let this slip another week.",
  },

  newsletter: {
    name: 'Newsletter v3',
    pillar: 'side',
    pillarLabel: 'Side Gigs · Writing',
    status: 'active',
    due: { m: 5, d: 28, y: 2026 },
    latest:
      "Migration to Beehiiv is the unblock — current platform is biting back every issue. Four-issue plan keeps the cadence honest through summer.",
    dod: "Beehiiv migration live and issue #14 sent from the new platform.",
    stamp: "Synthesized from 2 notes · refreshed 3d ago",
    milestones: [
      { state: 'done',     label: 'Beehiiv eval complete',   sub: 'May 6' },
      { state: 'current',  label: 'Outline 4 issues',        sub: '1 of 4' },
      { state: 'upcoming', label: 'Migrate subscribers' },
      { state: 'upcoming', label: 'Send issue 14 from Beehiiv' },
    ],
    initialTasks: [
      { id: 't0', label: 'Outline next 4 issues', next: true },
      { id: 't1', label: 'Migrate to Beehiiv' },
    ],
    riffSeed:
      "Themes I'm sitting on: making vs. shipping, the year of 'less', a piece about Cedric and how he negotiates. Four-issue arc could thread them.",
  },

  seo: {
    name: 'Construction SEO project',
    pillar: 'side',
    pillarLabel: 'Side Gigs',
    status: 'on-hold',
    due: null,
    holdReason: "Set down 2 months ago — no real client traction.",
    holdResurface: '2026-08-01',
    latest:
      "Set down 2 months ago. Original idea: niche SEO play for regional construction firms. Three discovery calls happened. None converted.",
    dod: "Either two paying clients, or formally drop.",
    stamp: "On hold · 62d",
    milestones: [
      { state: 'done',     label: 'Niche thesis written',   sub: 'Mar 12' },
      { state: 'done',     label: '3 discovery calls',      sub: 'Mar 18\u2013Apr 2' },
      { state: 'upcoming', label: 'First paid engagement' },
    ],
    initialTasks: [
      { id: 't0', label: 'Decide: drop or revive?' },
    ],
    riffSeed:
      "Reality is, the calls didn't convert because I'm not in the construction world. Either go deeper there for real, or drop it cleanly.",
  },

  zone2: {
    name: 'Zone 2 base block',
    pillar: 'sunny',
    pillarLabel: 'Slow Down Sunny',
    status: 'active',
    due: null,
    latest:
      "Eight-week base block. Three sessions a week minimum, with a long ride on weekends. The point is consistency, not heroics.",
    dod: "Finish 8 weeks with at least 22 sessions logged.",
    stamp: "Synthesized from training log · refreshed 4h ago",
    milestones: [
      { state: 'done',     label: 'Weeks 1\u20132',  sub: '7 sessions' },
      { state: 'current',  label: 'Week 3',          sub: '2 done, 1 to go' },
      { state: 'upcoming', label: 'Weeks 4\u20138' },
    ],
    initialTasks: [
      { id: 't0', label: "Log this week's sessions" },
    ],
    riffSeed: "Legs felt heavy Tuesday — sleep was bad. Don't push pace this week, just hold zone.",
  },

  reading: {
    name: 'Stoics reading list',
    pillar: 'sunny',
    pillarLabel: 'Slow Down Sunny',
    status: 'active',
    due: null,
    latest:
      "Finishing Meditations, picking up Seneca next. The aim is one book a month, with margin notes.",
    dod: "Five books read with notes pulled into Notes.",
    stamp: "Synthesized from reading journal",
    milestones: [
      { state: 'done',     label: 'Meditations',          sub: 'finished Apr' },
      { state: 'current',  label: 'Letters from a Stoic', sub: 'starting' },
      { state: 'upcoming', label: 'Enchiridion' },
    ],
    initialTasks: [
      { id: 't0', label: 'Finish Meditations Book 4', done: true },
      { id: 't1', label: 'Start Letters from a Stoic' },
    ],
    riffSeed: "What I keep coming back to: the dichotomy of control. Where else am I burning energy on things outside it?",
  },

  'ai-tooling': {
    name: 'Internal AI tooling proposal',
    pillar: 'side',
    pillarLabel: 'Arrow · Internal',
    status: 'idea',
    due: null,
    latest:
      "Drafted 3 months ago as an internal pitch — an AI layer on top of the existing knowledge base. Set aside because the team was at capacity. Resurfaced now because capacity is back.",
    dod: "Either greenlight a small team, or close it formally.",
    stamp: "Resurfaced after 3 months",
    milestones: [
      { state: 'done',     label: 'Initial pitch document', sub: 'Feb 18' },
      { state: 'current',  label: 'Decision: revive or close' },
    ],
    initialTasks: [
      { id: 't0', label: 'Re-read the original pitch' },
      { id: 't1', label: 'Ask Marta if capacity is real this time' },
    ],
    riffSeed:
      "Three months ago this was a no-brainer in theory but no one had time. Capacity question is the actual gate, not the idea.",
  },

  // Lightweight idea-only projects (no detailed content yet)
  'comp-bench': {
    name: 'Regional comp benchmarking',
    pillar: 'arrow',
    pillarLabel: 'Arrow · People',
    status: 'idea',
    due: null,
    latest: "Idea from 2 months ago — pull comp data across Casablanca, Lisbon, Berlin so we're not negotiating blind.",
    dod: "A simple sheet that answers 'what's market here?' in five minutes.",
    stamp: "Idea · 2mo old",
    milestones: [
      { state: 'current', label: 'Decide: pursue this quarter?' },
    ],
    initialTasks: [
      { id: 't0', label: 'Pull comp data from Levels/Glassdoor' },
    ],
    riffSeed: "Even rough numbers would beat what we're doing now. Could be a one-day project.",
  },
  onboarding: {
    name: 'Onboarding handbook rewrite',
    pillar: 'arrow',
    pillarLabel: 'Arrow · Internal',
    status: 'idea',
    due: null,
    latest: "Set 5 months ago. The current handbook is fine but feels generic — new hires don't actually use it.",
    dod: "A handbook new hires actually open in their first week.",
    stamp: "Idea · 5mo old",
    milestones: [
      { state: 'current', label: 'Decide: rewrite or kill?' },
    ],
    initialTasks: [],
    riffSeed: "Half the content lives in Slack threads anyway. What's the smallest version that's actually useful?",
  },
  sourdough: {
    name: 'Sourdough rye starter',
    pillar: 'sunny',
    pillarLabel: 'Slow Down Sunny',
    status: 'idea',
    due: null,
    latest: "Idea from a few weeks ago — get a rye starter going at home.",
    dod: "A loaf I'm proud of.",
    stamp: "Idea · 3w old",
    milestones: [
      { state: 'current', label: 'Order rye flour' },
      { state: 'upcoming', label: 'Bake test loaf' },
    ],
    initialTasks: [],
    riffSeed: "Less ambition, more rhythm. Bake one loaf a weekend, see what happens.",
  },
  meditation: {
    name: 'Meditation streak tracker',
    pillar: 'sunny',
    pillarLabel: 'Slow Down Sunny',
    status: 'idea',
    due: null,
    latest: "Idea from last month — a tiny tracker for daily 10-min sits.",
    dod: "A streak that actually motivates me.",
    stamp: "Idea · 1mo old",
    milestones: [
      { state: 'current', label: 'Decide: build or use existing app?' },
    ],
    initialTasks: [],
    riffSeed: "The point isn't the streak itself — it's the daily check-in. Don't over-engineer.",
  },
  pacuvius: {
    name: 'Read the new Pacuvius letters',
    pillar: 'sunny',
    pillarLabel: 'Slow Down Sunny',
    status: 'idea',
    due: null,
    latest: "Idea from 2 months ago — read the recently-published Pacuvius letters.",
    dod: "Read with notes.",
    stamp: "Idea · 2mo old",
    milestones: [],
    initialTasks: [],
    riffSeed: "Probably 4 evenings. Get the print edition.",
  },

  // Fallback example
  accenture: {
    name: 'Accenture engagement',
    pillar: 'arrow',
    pillarLabel: 'Arrow · ECS',
    status: 'active',
    due: { m: 5, d: 2, y: 2026 },
    latest:
      "Jon flagged that the relationship needs attention — Accenture wants a status update and reassurance the timeline holds. A shared project tracker came up as the likely deliverable. Nothing has gone out to them yet.",
    dod: "Tracker delivered, June 2 response sent, and Accenture has confirmed they're aligned on the timeline.",
    stamp: "Synthesized from 3 Notion notes · refreshed 2d ago",
    milestones: [
      { state: 'done',     label: 'Kickoff & scope agreed',           sub: 'Apr 8' },
      { state: 'current',  label: 'Response & tracker to client',     sub: 'in progress' },
      { state: 'upcoming', label: 'Mid-engagement review' },
      { state: 'upcoming', label: 'Handoff' },
    ],
    initialTasks: [
      { id: 't0', label: 'Sync with Jon on relationship status', done: true },
    ],
    riffSeed:
      "Jon said we have to get back to Accenture and keep things on track. Need to respond by June 2nd. Probably need a project tracker to share with the team. Also reminded me that the relationship has been frosty since the last cycle — we should think about a longer-term re-engagement plan, not just the immediate response.",
  },
};

// Prototype seed registry — kept for reference (statusSeed/riffSeed copy
// patterns), but no longer pushed onto window. App.reloadData populates
// window.PROJECTS exclusively from Supabase.
