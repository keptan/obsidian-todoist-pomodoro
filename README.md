# Mikumodoro Timer

A flowmodoro-style pomodoro timer for Obsidian with deep Todoist integration and a contribution heatmap.

## Features

- **Flowmodoro timer** — Work as long as you want, then take a break proportional to your work duration (default 1/5 ratio). No rigid 25-minute blocks.
- **Todoist integration** — Browse, select, and complete tasks directly from your Todoist inbox. Tasks sync automatically.
- **Pomodoro heatmap** — A GitHub-style contribution grid showing your daily work sessions. Year and month views with navigation.
- **Task detail cards** — Click any task to see project, due date, priority, and time logged. Link notes to tasks, create subtasks inline.
- **Session logging** — Every work session is recorded with task, duration, and timestamp. Add manual sessions or sync completed task history from Todoist.
- **Sound & notifications** — Optional chime when a break starts, plus system notifications.
- **Auto-refresh** — Tasks refresh every 5 minutes and after session completions. Heatmap updates live.

## Setup

1. Install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding `keptan/obsidian-todoist-pomodoro` as a beta plugin, or manually copy `main.js`, `styles.css`, and `manifest.json` into your vault's `.obsidian/plugins/obsidian-todoist-pomodoro/` folder.
2. Enable the plugin in Obsidian settings.
3. Open Settings → Mikumodoro Timer and paste your Todoist API token (get it from Todoist Settings → Integrations → Developer).
4. Click "Test Connection" to verify.
5. Click the timer icon in the ribbon to open the timer view.

## Usage

- **Start Work** — Select a task from the list and hit Start Work. The timer runs until you end the session.
- **End Session** — Ends your work session and auto-starts a break (break = work duration / break ratio).
- **Skip Break** — Ends the break early.
- **Pause/Resume** — Pause mid-session and resume without losing elapsed time.
- **Task list** — Browse tasks grouped by project. Top-level tasks without a project appear as standalone headers. Expand/collapse projects and tasks. Click a task to select it.
- **Add tasks** — Use the ＋ button on any project or standalone task header to create a new task or subtask.
- **Link notes** — Use the 🔗 button on standalone task headers to link an Obsidian note to that task.
- **Heatmap** — The `mikumodoro-heatmap` codeblock renders a contribution grid in any note. Use the toggle to switch between year and month views.
- **Track Activity** — Log manual time entries for tasks without running the timer.
- **Sync History** — Pull completed task history from Todoist to populate heatmap completion badges.

## Configuration

| Setting | Description | Default |
|---|---|---|
| Todoist API Token | Your Todoist API token | — |
| Default work duration | Minutes used for break calculation when no session ran | 25 |
| Break ratio | Break = work duration ÷ this ratio | 5 |
| Auto-start break | Automatically start break timer after work session | On |
| Sound chime | Play a chime when break starts | On |
| System notifications | Native notifications for break reminders | On |
| Heatmap color | Hex color for heatmap cells | `#7c3aed` |
| Heatmap default view | Year or month | Year |

## Development

```bash
git clone https://github.com/keptan/obsidian-todoist-pomodoro.git
cd obsidian-todoist-pomodoro
npm install
npm run dev   # watch mode
npm run build # production build
```

Requires Node.js 18+ and an Obsidian vault for testing.

## License

MIT
