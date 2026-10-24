# Hallway

A mobile web app. The home screen is **Today**: a calendar, suggestions for what the conference would give the user, and people they could meet.

| Path | What it is |
| --- | --- |
| `frontend/` | The Today screen. This is the app to run and keep pushing. |
| `backend/` | How each section should be loaded. Comments and types. No server yet. |
| `docs/FEATURES.md` | The feed, the fixed prompt, and the sponsorship follow-up |
| `docs/DATABASE.md` | The FalkorDB graph and the lookup order |

Sponsorship is not on the first screen. If the user's sentence parses as a job, the next screen asks. Otherwise it never appears.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The feed uses sample blocks until `backend/` is connected.

## Calendar rule

Today's calendar shows blocks synced from Google Calendar and blocks created when someone accepts a meeting message. Accepting a message writes one `CalendarBlock`. The calendar reads those blocks. It does not keep a second copy.
