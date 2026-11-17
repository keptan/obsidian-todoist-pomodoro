# Todoist Pomodoro Heatmap

An Obsidian Pomodoro timer with Todoist tasks and a contribution heatmap.

## Features

- Work for as long as you want, then take a break based on the time you worked.
- Browse, create, select, and complete Todoist tasks without leaving Obsidian.
- Drag tasks and project groups into your preferred order in the Obsidian task list.
- Group tasks by project, display subtasks, and link tasks to notes.
- See the closest assigned date across a task's subtasks or a project's tasks in a day-count bubble. Bubbles use your theme's colors, fading from blue at a week or more to red today, when the count becomes ❗. Overdue dates stay red with a negative day count. A task's deadline takes precedence over its assigned date.
- Task and project rows show up to three matching bubbles: closest date, active subtask count (all active tasks for a project), and total time including completed subtasks. Counts include nested subtasks. For example, an hour each on a parent, an active child, and a completed child shows `3h` total. Hover over a bubble for its meaning.
- Search active Todoist tasks and custom activities together in **Track activity** and **Log time**, ordered by most recently tracked. Untracked items follow alphabetically. Selecting a Todoist task in **Log time** adds the time to that task.
- Choose a work/rest plan before starting an activity or selected task. Stretch the outer slider handle to set a total of 5–120 minutes on a nonlinear scale, and move the inner divider to split work (theme green) and rest (theme red). Each plan starts from your configured defaults and applies only to that session. Arrow keys adjust handles by a minute; Home/End select their limits.
- Track sessions in year and month heatmaps.
- Add time manually and import completed-task history from Todoist.
- Optionally log push-ups, pull-ups, and dips, with workout volume shown on the heatmap. Pull-ups and dips count as three push-ups each.
- Optional break sounds and system notifications.

## Installation

In Obsidian, open **Settings → Community plugins → Browse**, search for **Todoist Pomodoro Heatmap**, then select **Install** and **Enable**.

You can also install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using:

```text
keptan/obsidian-todoist-pomodoro
```

For a manual installation, place `main.js`, `manifest.json`, and `styles.css` in:

```text
<vault>/.obsidian/plugins/todoist-pomodoro-heatmap/
```

Enable **Todoist Pomodoro Heatmap** under **Settings → Community plugins**.

## Setup

Open **Settings → Todoist Pomodoro Heatmap**, enter your Todoist API token, and test the connection. You can find the token under **Todoist Settings → Integrations → Developer**.

Select the timer icon in Obsidian's ribbon to open the timer. Choose a task and select **Start work**, or use **Track activity**. Select an activity, adjust the work/rest slider under **Start**, then select **Start** to begin. The timer reminds you at the selected work target and lets you keep working. When you end the session, the plugin starts a proportional break using the selected ratio. Your saved defaults remain unchanged.

To add a heatmap to a note, use:

````markdown
```mikumodoro-heatmap
```
````

## Privacy

Todoist Pomodoro Heatmap has no telemetry. It connects directly to Todoist only after you provide an API token. Your token, settings, sessions, workouts, task links, completion history, and recent-activity timestamps are stored in the plugin folder. Parent and project IDs are retained after task completion so historical time stays in the right totals. Completed-task history is fetched back to the earliest recorded session (or the rolling year, whichever starts earlier) to recover these links. Sessions, workouts, and completions also use small, immutable local recovery records while additive data is reconciled across devices through the plugin's synced settings.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

For local testing, symlink `main.js`, `manifest.json`, and `styles.css` from this project into the vault's plugin folder. Keep settings and session data in the vault. With `npm run dev` running, source edits rebuild `main.js`; reload the plugin in Obsidian to load the changes.

## Releases

Keep `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` in sync, and add release notes in `release-notes/<version>.md`. Commit the changes and create an annotated tag matching the manifest version, without a leading `v`.

Push the branch and tag together:

```bash
git push --atomic origin main <version>
```

The tag triggers GitHub Actions to validate versions, test, lint, build, and publish a release containing `main.js`, `manifest.json`, and `styles.css`. Obsidian uses the published GitHub release for plugin updates. Build artifacts stay out of Git.

## License

[MIT](LICENSE)
