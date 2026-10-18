# Boss HP report protocol `bptimer.hp.v1`

Desktop clients report the HP of the tracked field bosses and magical
creatures they see, so the website can show every boss's HP per line. A report
names no account and no character: the server learns the region from the game
distribution and identifies the reporter only by its anonymous client token.

The canonical fixtures for every frame live in
[`hp-report-fixtures.json`](hp-report-fixtures.json). Client and server test
suites both parse them; update the fixtures together with this document.

## Connection

```
GET /v1/hp/ws
Authorization: Bearer <token>
Sec-WebSocket-Protocol: bptimer.hp.v1
```

- `<token>` is the anonymous client token from `POST /v1/clients`, the same
  one the team relay uses. A missing, unknown or banned token is rejected with
  `401`/`403` before the upgrade.
- A missing or different subprotocol is rejected with `400`. Incompatible
  protocol revisions get a new subprotocol name.
- All frames are UTF-8 JSON text frames. Binary frames are a protocol violation.
- Clients connect only while a tracked boss is in view and keep the connection
  for about a minute after the last one leaves.

## Reportable mobs

`GET /v1/mobs` lists the mobs the server accepts reports for. Clients read
`monster_id` and `has_locations` from each entry; mobs with `has_locations`
must be reported with a position.

## Context

`dist` is the game distribution: the game process name without `.exe` and
without a trailing `_steam` / `_epic` (`bpsr`, `starsea`, `starasia`,
`startw`, `star`). The server maps it to a region (for example `star` → CN,
`starasia` → JP) once per `ctx` frame. `line` is the in-game line of the open
world scene the client is in, `>= 1`.

## HP tuple

```
[monster_id, hp]            most mobs
[monster_id, hp, x, z]      mobs with has_locations
```

| Index | Field        | Meaning                                                      |
| ----- | ------------ | ------------------------------------------------------------ |
| 0     | `monster_id` | Game monster id (`AttrId`), `> 0`                            |
| 1     | `hp`         | HP percent in steps of 5, `0..=100`; `0` only once dead      |
| 2, 3  | `x`, `z`     | Rounded position, matched against the mob's spawn points     |

A frame carries at most 64 tuples.

## Client → server

| `t`   | Fields         | Effect                                                         |
| ----- | -------------- | -------------------------------------------------------------- |
| `ctx` | `dist`, `line` | Where the following `hp` frames come from; resent on any change |
| `hp`  | `e`            | Current HP of the listed mobs on the context's line            |

- Clients send `ctx` first, then their whole table. After a context change they
  send `ctx` again followed by the whole table; otherwise they send only the
  mobs whose step or position changed.
- `hp` before any `ctx` answers `error invalid`.
- Rejected tuples are dropped silently: unknown mobs, positions too far from
  every spawn point, and a reporter repeating its own step or raising it within
  the same spawn cycle. There are no acknowledgements.

## Server → client

| `t`     | Fields | Meaning                                                |
| ------- | ------ | ------------------------------------------------------ |
| `error` | `code` | `invalid`, `unsupported_dist`, `rate_limited`          |

`unsupported_dist` answers a `ctx` whose distribution maps to no enabled
region; clients stop reporting for that distribution.

## Liveness and close codes

- The server pings every 20 s and closes connections that sent nothing for 60 s.
  Clients reconnect when they received nothing for 60 s.
- Close codes: `1000` normal, `1001` server shutting down, `1008` protocol
  violation (malformed JSON, binary frame, oversized frame), `4003` token banned.
- Each connection has its own rate limit; frames over the limit are dropped
  with `error rate_limited`.

## Example

```json
{"t":"ctx","dist":"star","line":16}
{"t":"hp","e":[[10032,85],[10904,40,-282,86]]}
```
