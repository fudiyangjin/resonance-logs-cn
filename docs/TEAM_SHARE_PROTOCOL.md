# Team skill cooldown sharing protocol `bptimer.team.v1`

Desktop clients that capture the local character's skill cooldowns join a
per-team room on the relay server and receive the cooldowns of teammates that
run a compatible client. The relay never stores this data outside memory.

The canonical fixtures for every frame live in
[`team-share-fixtures.json`](team-share-fixtures.json). Client and server test
suites both parse and re-serialize them; update the fixtures together with this
document.

## Connection

```
GET /v1/team/ws
Authorization: Bearer <token>
Sec-WebSocket-Protocol: bptimer.team.v1
```

- `<token>` is an anonymous client token from `POST /v1/clients`
  (`{"app": "<client name>"}` → `{"client_id": 1, "token": "..."}`). A missing,
  unknown or banned token is rejected with `401`/`403` before the upgrade.
- A missing or different subprotocol is rejected with `400`. Incompatible
  protocol revisions get a new subprotocol name.
- All frames are UTF-8 JSON text frames. Binary frames are a protocol violation.
- Each token may hold at most a few concurrent connections (server
  configuration, default 3).

## Identity and rooms

- `dist` is the game distribution: the game process name without `.exe` and
  without a trailing `_steam` / `_epic` (`bpsr`, `starsea`, `starasia`,
  `startw`, `star`). The server only checks `[a-z0-9]{1,16}`.
- `team` is the in-game team id, `char` the character id. Both are positive
  64-bit integers sent as **decimal strings**.
- A room is `(dist, team)`. Within a room a `char` is owned by the first token
  that joined with it. The same token joining again replaces its previous
  connection (that connection is closed with `4001`); another token receives
  `error conflict`.
- Member A sees member B only when **both** rosters contain the other's `char`.
  The server applies this rule to every frame it forwards, including snapshots.

## Cooldown tuple

```
[skill_level_id, duration, cd_type, valid_cd_time, calculated_duration, accelerate_rate, anchor_ms]
```

| Index | Field                 | Meaning                                                               |
| ----- | --------------------- | --------------------------------------------------------------------- |
| 0     | `skill_level_id`      | Skill level id from the game packet (`skill_id * 100 + level`), `> 0` |
| 1     | `duration`            | Base cooldown in ms from the game packet, `-1` for resource slots     |
| 2     | `cd_type`             | Game cooldown type enum                                               |
| 3     | `valid_cd_time`       | Server-reported elapsed/valid cooldown time in ms                     |
| 4     | `calculated_duration` | Cooldown after the sender's own reduction attributes, in ms           |
| 5     | `accelerate_rate`     | Cooldown accelerate rate (`0.25` = 25 % faster)                       |
| 6     | `anchor_ms`           | Moment the sender received the packet, in **game-server** Unix ms     |

`anchor_ms` is the sender's capture time minus its measured game-server clock
offset. Receivers add their own offset to get a local time, so desktop clock
skew and relay latency never shift the countdown. Durations are bounded to one
day, a frame carries at most 128 tuples, and `anchor_ms` must be within one hour
of the relay's clock.

## Client → server

| `t`     | Fields                                            | Effect                                                                  |
| ------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `join`  | `dist`, `team`, `char`, `roster`, `name`, `class` | Enter or switch rooms; sent again whenever roster, name or class change |
| `cd`    | `e`: tuple list                                   | Upsert the sender's cooldowns (keyed by `skill_level_id`)               |
| `clear` | —                                                 | Drop all of the sender's cooldowns                                      |
| `leave` | —                                                 | Leave the room; the connection stays open                               |

- `roster` lists every known team member including the sender (at most the room
  size limit). `name` is truncated to 32 characters, `class` is the profession id.
- After every `join` the server answers with a fresh `snapshot`; clients replace
  their teammate table with it. Re-joining the same room keeps the sender's
  cooldowns, switching rooms drops them. Clients send their full table after
  each `join`.
- `cd`, `clear` and `leave` before a successful `join` answer `error invalid`.

## Server → client

| `t`        | Fields                                | Meaning                                              |
| ---------- | ------------------------------------- | ---------------------------------------------------- |
| `snapshot` | `members`: `[{char, name, class, e}]` | Complete state of every member currently visible     |
| `member`   | `char`, `name`, `class`               | A member became visible or changed name/class        |
| `cd`       | `char`, `e`                           | Cooldown upsert from a visible member                |
| `clear`    | `char`                                | A visible member dropped all cooldowns               |
| `left`     | `char`                                | A member left, disconnected or stopped being visible |
| `error`    | `code`                                | `invalid`, `conflict`, `room_full`, `rate_limited`   |

`char` in forwarded frames is always stamped by the server from the sender's
connection; a client can never speak for another member. Frames are never
echoed back to their sender.

## Liveness and close codes

- The server pings every 20 s and closes connections that sent nothing for 60 s.
  Clients reconnect when they received nothing for 60 s.
- Close codes: `1000` normal, `1001` server shutting down, `1008` protocol
  violation (malformed JSON, binary frame, oversized frame), `1013` receiver too
  slow (reconnect and take a new snapshot), `4001` replaced by a newer
  connection of the same token, `4003` token banned.
- Frames are limited to 32 KiB. Each connection has its own rate limit; frames
  over the limit are dropped with `error rate_limited`.

## Example

```json
{"t":"join","dist":"star","team":"7000000000000000123","char":"123456789","roster":["123456789","987654321"],"name":"Alice","class":4}
{"t":"cd","e":[[142001,30000,1,5522,30000,0.0,1790300898228]]}
{"t":"cd","char":"987654321","e":[[220101,60000,0,0,54000,0.1,1790300899001]]}
```
