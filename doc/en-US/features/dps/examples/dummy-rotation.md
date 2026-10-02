# Test a 3-minute rotation with training dummy mode

Related page: [DPS Meter](../README.md)

**Scenario**: You've switched to a new set of modules and want to hit a dummy at the training ground for a fixed 3 minutes to compare DPS between the old and new setups.

## Preparation

1. Open **{{ui:routes.tools.dps}} → {{ui:routes.dps.themes}} → {{ui:themes.tabs.live}} → {{ui:themes.header.title}}** and make sure **{{ui:themes.header.showHeaderControl}}** is checked.
2. Open **{{ui:routes.tools.dps}} → {{ui:routes.dps.settings}} → {{ui:settings.tabs.live}}**:
   - Keep **{{ui:settings.live.trainingWindow}}** at the default 3:03, or change it to your preferred duration;
   - Set **{{ui:settings.live.trainingLockPolicy}}** to **{{ui:settings.live.trainingLockPolicy.eliteDummies}}**.

## Starting a round

1. Go to the training ground and stand in front of an elite dummy.
2. Click the **crosshair button** in the live window's header; the status changes to **Training dummy armed**.
3. Land your first hit on the dummy; it is locked automatically, the status changes to **Training dummy running**, and the timer starts.
4. When the set duration is reached, the status changes to **Segment finished**: the live window freezes and the data is saved to history at the same time.

```text
Armed ──first hit──▶ Running ──time up──▶ Finished
  ▲                                          │
  └────────────── click "Reset" ─────────────┘
```

## Next round and comparison

- After the round finishes, attacking again does **not** start a new round automatically. Click **Reset** first to return to armed; this lets you change gear and wait for cooldowns before starting.
- You can also click **Reset** in the middle of a round to abandon it.
- Every round is saved to **{{ui:routes.dps.history}}**. You can **add it to favorites** and use "Favorites only" to compare several rounds side by side.

> [!WARNING]
> Changing zones, switching channels, or entering/leaving the guild automatically exits training dummy mode; click the crosshair again when you're back.

> [!TIP]
> Not at the training ground? Set the training lock to **{{ui:settings.live.trainingLockPolicy.firstMonster}}** to time the first monster you hit in the open world — useful for testing single-target rotations.
