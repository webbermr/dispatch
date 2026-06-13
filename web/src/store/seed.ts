import type { App, Card } from './types'

export const seedApps: App[] = [
  { id: 'a1', name: 'Pocket Ledger', repo: 'maya/pocket-ledger', stack: 'Next.js · Supabase · TypeScript', cloned: true, base: 'main', accent: 'var(--brand-primary)' },
  { id: 'a2', name: 'TrailMix', repo: 'maya/trailmix', stack: 'React Native · Expo · TypeScript', cloned: true, base: 'main', accent: 'var(--color-navy)' },
  { id: 'a3', name: 'Glassbox CMS', repo: 'maya/glassbox', stack: 'Astro · Tailwind · MDX', cloned: false, base: 'main', accent: 'var(--color-blue2-dark)' },
  { id: 'a4', name: 'Hearth', repo: 'maya/hearth-iot', stack: 'Go · MQTT · SQLite', cloned: true, base: 'main', accent: 'var(--color-purple-dark)' },
]

export function seedCards(): Card[] {
  return [
    // TrailMix (a2) — the rich demo board
    {
      id: 'c1', appId: 'a2', type: 'feature', priority: 'med', status: 'ideas',
      title: 'Offline trail caching',
      desc: 'Let hikers download a trail + map tiles so the app works with no signal on the mountain.',
      prompt:
        'Add offline support for trails.\n\n- Add a "Download for offline" action on the Trail Detail screen.\n- Cache the trail GeoJSON and the surrounding map tiles (zoom 12–16) to local storage.\n- Show a download progress indicator and a "Saved offline" badge.\n- When offline, read from cache and hide network-only actions.\n- Add a Downloads section in Settings to manage/clear cached trails.',
    },
    {
      id: 'c2', appId: 'a2', type: 'enhancement', priority: 'low', status: 'ideas',
      title: 'Dark mode for map view',
      desc: 'The bright map blows out night hikes. Add a dark tile theme that follows system appearance.',
      prompt:
        'Add a dark map theme.\n\n- Use a dark tile style for the map when the system is in dark mode.\n- Add a manual override toggle in Settings (System / Light / Dark).\n- Make sure route lines and markers stay legible on the dark tiles.',
    },
    {
      id: 'c3', appId: 'a2', type: 'bug', priority: 'high', status: 'ready',
      title: 'GPS drift on Android',
      desc: 'Recorded tracks zig-zag badly on Android 14. Position jumps up to ~40m between points.',
      prompt:
        'Fix GPS drift on Android.\n\n- Investigate the location stream on Android 14 (Pixel + Samsung).\n- Apply a Kalman / accuracy filter and drop points with accuracy worse than 25m.\n- Smooth the recorded polyline without losing real elevation changes.\n- Add a regression test using a recorded noisy trace fixture.',
    },
    {
      id: 'c4', appId: 'a2', type: 'feature', priority: 'med', status: 'ready',
      title: 'Elevation profile chart',
      desc: 'Show an interactive elevation-vs-distance chart under each trail with a draggable marker.',
      prompt:
        'Add an elevation profile chart to Trail Detail.\n\n- Render elevation over distance from the trail track.\n- Dragging along the chart moves a marker on the map (and vice-versa).\n- Show total ascent / descent and max grade above the chart.\n- Keep it 60fps on a mid-range Android device.',
    },
    {
      id: 'c5', appId: 'a2', type: 'feature', priority: 'high', status: 'building',
      title: 'Share a trail to friends',
      desc: 'Native share sheet + deep link so a trail opens straight in the app for whoever you send it to.',
      branch: 'feat/share-trail',
      build: {
        progress: 14, currentStep: 'Cloning context',
        logs: [
          '$ codex run --task TM-118 --branch feat/share-trail',
          '✓ Repo synced · maya/trailmix @ main',
        ],
      },
    },
    {
      id: 'c6', appId: 'a2', type: 'bug', priority: 'high', status: 'review',
      title: 'Crash on empty favorites list',
      desc: 'App hard-crashes opening Favorites before the first sync because the list is undefined.',
      branch: 'fix/empty-favorites',
      diff: [
        {
          file: 'src/screens/FavoritesScreen.tsx', add: 6, del: 1, lines: [
            { t: 'ctx', text: '  const favorites = useFavorites();' },
            { t: 'ctx', text: '' },
            { t: 'del', text: '  return <List data={favorites} renderItem={renderRow} />;' },
            { t: 'add', text: '  if (!favorites?.length) {' },
            { t: 'add', text: '    return <EmptyState title="No favorites yet" hint="Tap the heart on any trail." />;' },
            { t: 'add', text: '  }' },
            { t: 'add', text: '' },
            { t: 'add', text: '  return <List data={favorites} renderItem={renderRow} />;' },
          ],
        },
        {
          file: 'src/components/EmptyState.tsx', add: 11, del: 0, lines: [
            { t: 'add', text: 'export function EmptyState({ title, hint }) {' },
            { t: 'add', text: '  return (' },
            { t: 'add', text: '    <View style={styles.wrap}>' },
            { t: 'add', text: '      <Text style={styles.title}>{title}</Text>' },
            { t: 'add', text: '      {hint ? <Text style={styles.hint}>{hint}</Text> : null}' },
            { t: 'add', text: '    </View>' },
            { t: 'add', text: '  );' },
            { t: 'add', text: '}' },
          ],
        },
        {
          file: 'src/hooks/useFavorites.ts', add: 1, del: 1, lines: [
            { t: 'ctx', text: '  const { data } = useQuery(["favorites"], fetchFavorites);' },
            { t: 'del', text: '  return data;' },
            { t: 'add', text: '  return data ?? [];' },
          ],
        },
      ],
      chat: [
        { role: 'agent', text: 'Done. The crash came from `favorites` being undefined before the first fetch resolved. I added a null-guard in the hook and a friendly empty state. 3 files changed, 42 tests passing.' },
      ],
    },
    {
      id: 'c7', appId: 'a2', type: 'enhancement', priority: 'med', status: 'merged',
      title: 'Faster map tile loading',
      desc: 'Pre-warm and cache adjacent tiles so panning the map stops flashing grey squares.',
      branch: 'enh/tile-cache', mergedAt: 'Merged yesterday · 2:14 PM',
      diff: [{ file: 'src/map/tileCache.ts', add: 38, del: 6, lines: [] }],
    },
    {
      id: 'c8', appId: 'a2', type: 'feature', priority: 'low', status: 'merged',
      title: 'Apple Health sync',
      desc: 'Push completed hikes (distance, elevation, duration) into Apple Health as workouts.',
      branch: 'feat/health-sync', mergedAt: 'Merged 3 days ago',
      diff: [{ file: 'ios/HealthSync.swift', add: 91, del: 0, lines: [] }],
    },

    // Pocket Ledger (a1)
    {
      id: 'd1', appId: 'a1', type: 'enhancement', priority: 'low', status: 'ideas',
      title: 'Budgets dashboard',
      desc: 'A monthly budget overview with category rings and an over/under banner.',
      prompt: 'Build a monthly budgets dashboard.\n\n- Per-category spend vs budget as progress rings.\n- A top banner showing total over/under for the month.\n- Tapping a category drills into its transactions.',
    },
    {
      id: 'd2', appId: 'a1', type: 'feature', priority: 'high', status: 'ready',
      title: 'Recurring transactions',
      desc: 'Let users mark a transaction as recurring (weekly/monthly) and auto-generate future entries.',
      prompt: 'Add recurring transactions.\n\n- Add a recurrence option (none/weekly/monthly/yearly) when creating a transaction.\n- Generate upcoming entries and show them as "scheduled".\n- Allow editing/skipping a single occurrence or the whole series.',
    },
    {
      id: 'd3', appId: 'a1', type: 'bug', priority: 'med', status: 'ready',
      title: 'Negative balance allowed',
      desc: 'Transfers can push an account below zero without warning. Add validation + a confirm step.',
      prompt: 'Prevent silent negative balances.\n\n- Validate transfers and expenses against the source account balance.\n- If it would go negative, require an explicit confirmation.\n- Surface a subtle "over budget" indicator on the account.',
    },
    {
      id: 'd4', appId: 'a1', type: 'feature', priority: 'med', status: 'merged',
      title: 'CSV export',
      desc: 'Export filtered transactions to CSV and share via the system sheet.',
      branch: 'feat/csv-export', mergedAt: 'Merged last week',
      diff: [{ file: 'src/export/csv.ts', add: 54, del: 2, lines: [] }],
    },

    // Glassbox CMS (a3) — NOT cloned, so starting triggers the clone modal
    {
      id: 'e1', appId: 'a3', type: 'feature', priority: 'med', status: 'ready',
      title: 'Draft preview links',
      desc: 'Generate a shareable, expiring preview URL for unpublished drafts.',
      prompt: 'Add draft preview links.\n\n- Generate a signed, expiring URL for any draft.\n- Preview renders the draft exactly as it would publish, with a "Draft" ribbon.\n- Editors can revoke a link from the draft toolbar.',
    },
    {
      id: 'e2', appId: 'a3', type: 'feature', priority: 'low', status: 'ideas',
      title: 'AI alt-text suggestions',
      desc: 'Suggest accessible alt text for uploaded images, editable before saving.',
      prompt: 'Suggest image alt text.\n\n- On image upload, propose alt text the editor can accept or rewrite.\n- Never save without alt text; warn if left blank.\n- Keep suggestions concise and descriptive.',
    },
    {
      id: 'e3', appId: 'a3', type: 'bug', priority: 'high', status: 'ideas',
      title: 'Slug collision on publish',
      desc: 'Publishing two posts with the same title silently overwrites the first one’s slug.',
      prompt: 'Fix slug collisions on publish.\n\n- Detect duplicate slugs at publish time.\n- Auto-append a numeric suffix and surface it to the editor before confirming.\n- Add a test for the collision path.',
    },

    // Hearth (a4)
    {
      id: 'f1', appId: 'a4', type: 'bug', priority: 'high', status: 'ready',
      title: 'Reconnect on MQTT drop',
      desc: 'Devices go stale when the broker connection drops; needs exponential-backoff reconnect.',
      prompt: 'Add resilient MQTT reconnection.\n\n- Detect broker disconnects and reconnect with exponential backoff + jitter.\n- Re-subscribe to all device topics after reconnect.\n- Mark devices "stale" in the UI while disconnected.',
    },
    {
      id: 'f2', appId: 'a4', type: 'enhancement', priority: 'low', status: 'ideas',
      title: 'Scene scheduling',
      desc: 'Schedule lighting/temperature scenes by time of day and sunrise/sunset offsets.',
      prompt: 'Add scene scheduling.\n\n- Schedule scenes by clock time or sunrise/sunset +/- offset.\n- Per-day enable/disable.\n- A timeline view of the day’s scheduled scenes.',
    },
  ]
}
