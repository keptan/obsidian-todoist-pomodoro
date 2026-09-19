# Todoist Pomodoro Heatmap

An Obsidian Pomodoro timer with Todoist tasks and a contribution heatmap.

## Features

- Work for as long as you want, then take a break based on the time you worked.
- Browse, create, select, and complete Todoist tasks without leaving Obsidian.
- Drag tasks and project groups into your preferred order in the Obsidian task list.
- Group tasks by project, display subtasks, and link tasks to notes.
- Track sessions in year and month heatmaps.
- Add time manually and import completed-task history from Todoist.
- Optionally log push-ups and pull-ups, with workout volume shown on the heatmap.
- Optional break sounds and system notifications.

## Installation

Until the plugin is available in Obsidian's community plugin browser, install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using:

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

Select the timer icon in Obsidian's ribbon to open the timer. Choose a task and start working. When you end the session, the plugin starts a proportional break using your configured break ratio.

To add a heatmap to a note, use:

````markdown
```mikumodoro-heatmap
```
````

## Privacy

Todoist Pomodoro Heatmap has no telemetry. It connects directly to Todoist only after you provide an API token. Your token, settings, sessions, workouts, task links, and completion history are stored in the plugin folder. Sessions, workouts, and completions also use small, immutable records so vault-sync services can merge activity from multiple devices without relying on a single shared `data.json` write.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## License

[MIT](LICENSE)
