# Challenge Watch

**{{ui:routes.tools.dps}} → {{ui:routes.dps.challenge}}** lets you mark "forbidden damage": as soon as a party member takes any of this damage in the current combat segment, a **red triangle** warning appears next to their name.

It's meant for challenge objectives like "don't get hit by a certain mechanic", so you know halfway through the fight whether the challenge has already failed.

## Adding forbidden damage

1. Search the search box by mechanic or damage name, e.g. "Drone Cannon".
2. Click Add on a result; added entries appear under **{{ui:challengeWatch.configuredTitle}}**.
3. You can also use the built-in preset **{{ui:challengeWatch.preset.n17Fuyoupao}}** directly.

![Challenge Watch page, searched for "Drone Cannon" and added](../../../shared/img/dps/challenge_1.en-US.png)

## Where the warning appears

The red triangle appears after the party member's name in the DPS, healing, and damage-taken lists of the live window. Hover over it to see exactly which damage they took.

![red triangle after a party member's name in the live window](../../../shared/img/dps/challenge_2.en-US.png)

The warning only applies to the **current combat segment**; it's re-evaluated after the fight is split or reset.

## Examples

- [See who got hit by the Drone Cannon in a challenge dungeon](./examples/challenge-hits.md)