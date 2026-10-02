# Playback and alerts

This page explains how announcements are queued and played in real combat, how to include the fantasy tier in your text, and the match alerts for when you are queueing for dungeons.

## Playback settings

In **{{ui:routes.tools.voice}} → {{ui:voice.tabs.overview}}**:

- **{{ui:voice.overview.enabled}}**: the master switch. When it is off, no announcement plays.
- **Volume**: shared by all announcements.
- **{{ui:voice.overview.stopPlayback}}**: stops the current playback immediately.
- **{{ui:voice.overview.status.title}}**: shows the model, generation engine, number of voices and number of phrases.

## Priority and queue

Several announcements may trigger at the same time in combat. Each announcement can have a **{{ui:voice.binding.priority}}**:

| Level | Suggested use |
| --- | --- |
| **{{ui:voice.binding.priority.default}}** | Unimportant hints |
| **{{ui:voice.binding.priority.low}}** / **{{ui:voice.binding.priority.medium}}** | Routine rotation reminders, such as a buff being ready |
| **{{ui:voice.binding.priority.high}}** | Things you must react to right away, such as a Boss's big attack |
| **{{ui:voice.binding.priority.urgent}}** | Mechanics that wipe the party if ignored |

Announcements of the same priority never interrupt each other; they play one after another in order. Under **{{ui:voice.overview.queuePolicy}}** you can also turn on:

- **{{ui:voice.overview.queue.drop}}**: during busy moments, drops low-priority announcements waiting at the back of the queue, so alerts don't pile up and arrive later and later.
- **{{ui:voice.overview.queue.interrupt}}**: only an event with a priority **strictly higher** than the current announcement can interrupt it.

> [!TIP]
> Keep most announcements at Default or Low priority and set only the few truly critical ones to High or Urgent. Otherwise interrupting loses its meaning.

## Fantasy tier placeholder

Some buffs are applied by a fantasy, and the source fantasy has a tier from **0 to 5**. To say the tier in an announcement, put a placeholder in the custom text for **On gain / On expiry**:

| Placeholder | Notes |
| --- | --- |
| `${阶数}` | Chinese form |
| `${remodelLevel}` | Equivalent to the above; easier to type on an English keyboard |

The app only recognizes these two exact tokens (in any UI language). The placeholder is always replaced with the tier number followed by the Chinese tier character 阶 (for example `5阶`), whatever the UI language is. For example, with the custom text "Tina${remodelLevel} active", when your Tina is tier 5 the announcement is "Tina5阶 active". Preview the line to check how your voice pronounces it.

- It only works in the "On gain / On expiry" events of **Live Monitor Buff** and **Monster Buff**. "x seconds left", counters, Boss DBM and dungeon mechanics do not expand the tier.
- The app generates one audio clip for each tier 0–5, plus a fallback line with the placeholder removed, which is used when the tier cannot be determined.
- **Preview** plays the tier 5 example; in real combat the audio is picked according to the tier detected at that moment.
- After editing the text, remember to click **{{ui:voice.bindings.generateMissing}}** in **{{ui:voice.tabs.bindings}}**.

Buffs whose source fantasy tier can be detected are also shown as "Name | Tier n" in the overlay, whether or not voice is configured. For a complete example, see [Example: Voice alert when Tina's CD is ready](../monitor/examples/tina-cd.md).

## Match alerts

**{{ui:voice.tabs.alerts}}** can keep you informed of your dungeon queue while you are tabbed out of the game. The three notifications can be turned on separately:

| Notification | When it triggers | Preset broadcast text |
| --- | --- | --- |
| **{{ui:voice.alerts.matchReady.title}}** | A match has been found and you need to confirm | {{ui:voice.alerts.autoText.matchReady}} |
| **{{ui:voice.alerts.readyCheck.title}}** | The party leader starts a ready check | {{ui:voice.alerts.autoText.readyCheck}} |
| **{{ui:voice.alerts.teamVote.title}}** | The party starts a vote to enter the dungeon | {{ui:voice.alerts.autoText.teamVote}} |

The app comes with built-in preset audio for these three notifications that matches the app language, working out of the box without installing a model or generating audio. Generating audio is only needed when using custom phrases. Match alerts also require **{{ui:voice.overview.enabled}}** to be on.

## Examples

- [Hear "match found" while queueing AFK](./examples/match-found.md)