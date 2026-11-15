# Class skills and imagine skills in separate areas

Related page: [Skill CD](../skill-cd.md)

**Scenario**: You want your class burst skills in a row to the right of your character and your imagine and duty skills on the left, plus a voice cue 3 seconds before your ultimate is ready.

## Step 1: Pick the class and skills

1. Pick your class in **{{ui:skillMonitor.profile.title}} → {{ui:skillMonitor.profile.classLabel}}** at the top of the page.
2. Open **{{ui:routes.tools.skillMonitor}} → {{ui:skillMonitor.tabs.skillCd}}** and click the class skills you want in **{{ui:skillMonitor.skillCd.skills.title}}**. All areas together hold up to 10 skills.

## Step 2: Split into two areas

1. In **{{ui:skillMonitor.skillCd.preview.title}}**, click **{{ui:skillMonitor.skillCd.region.add}}** and name the new area "Imagines".
2. Switch to "Imagines", then search for imagine skills in **{{ui:skillMonitor.skillCd.resonance.title}}** and pick duty skills in **{{ui:skillMonitor.skillCd.duty.title}}**; they go into the current area.
3. Set "Area 1" to 1 for **{{ui:skillMonitor.skillCd.layout.rows}}** and 5 for **{{ui:skillMonitor.skillCd.layout.columns}}**, and "Imagines" to 1 row and 3 columns.

## Step 3: Turn on the Skill CD Area and place it

1. Turn on the **Skill CD Area** in **{{ui:skillMonitor.tabs.overlay}}**.
2. Click **{{ui:skillMonitor.layout.editOverlayLayout}}** at the top of the page, drag the two areas to either side of your character and scale each one.

## Step 4: Cue before the ultimate is ready

1. In the **{{ui:skillMonitor.skillCd.voice.classSkills}}** tab of **{{ui:skillMonitor.skillCd.voice.title}}**, click your ultimate and turn on **x seconds before ready** with 3 seconds.
2. To hear the last seconds counted, also tick **{{ui:voice.binding.countdown}}**.
3. Open **{{ui:routes.tools.voice}} → {{ui:voice.tabs.bindings}}** and click **{{ui:voice.bindings.generateMissing}}**.

## Result

In combat, a row of skill icons sits on each side, dimmed with the seconds left while on cooldown; 3 seconds before your ultimate is ready you hear the cue.

> [!TIP]
> If the game's skill bar already shows a skill's CD and you only want the voice cue, you don't need to monitor it; set up the cue directly in the voice section.
