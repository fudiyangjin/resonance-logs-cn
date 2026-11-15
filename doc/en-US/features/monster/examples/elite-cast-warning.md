# Warning for an elite's dangerous cast

Related page: [Monster Skills](../monster-skill.md)

**Scenario**: An elite monster has a cast with no DBM warning that knocks you down if it hits. As soon as it starts casting, you want a clear line on the overlay with a countdown, plus a voice cue.

## Step 1: Find the skill

1. Open **{{ui:routes.tools.monsterMonitor}} → {{ui:monsterMonitor.tabs.monsterSkill}}** and search by skill name in **{{ui:monsterMonitor.monsterSkill.searchTitle}}**.
2. If you don't know the name, fight the monster once, find the skill ID in the skill markers of the [History](../../dps/history.md) timeline, then search by ID; a skill missing from the tables can be added by its full ID.

## Step 2: Set up the display

In **{{ui:monsterMonitor.monsterSkill.listTitle}}**:

1. Enter "Dodge!" as the **{{ui:monsterMonitor.monsterSkill.label}}**;
2. Set **{{ui:monsterMonitor.monsterSkill.displaySeconds}}** to the skill's cast time;
3. Tick **{{ui:monsterMonitor.monsterSkill.countdown}}**; the line then shows the seconds left and a progress bar.

## Step 3: Set up the voice

Turn on the **On trigger** announcement for the skill, pick custom text and enter "Dodge!"; then click **{{ui:voice.bindings.generateMissing}}** in **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}**.

## Step 4: Turn on the Monster Skills Area

Turn on the **Monster Skills Area** in **{{ui:monsterMonitor.tabs.overlay}}** (off by default), then click **{{ui:monsterMonitor.actions.editLayout}}** and drag it a little above the center of the screen.

## Result

As soon as the elite starts casting, "Dodge!" and a countdown appear on the overlay and you hear the cue; the countdown reaches zero as the skill lands.

> [!TIP]
> Some Bosses always cast skill B a fixed number of seconds after skill A. Add A to the list with "B incoming" as its alias and the gap as its display seconds to announce B in advance; see [Counting down to the next skill](../monster-skill.md#counting-down-to-the-next-skill).
