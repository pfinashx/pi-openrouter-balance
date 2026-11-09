# pi-openrouter-balance

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that shows your **OpenRouter credit balance** in the footer, right below the input line. The balance is colored by thresholds you set.

![Footer with OR balance](docs/footer-0.2.0.png)

```
caveman:lite ● 🌐 OR balance: $22.37 ○ 🐴 ponytail: ⚡ FULL telegram disconnected
```

## Features

- Shows `OR balance: $X.XX` in the pi footer with a configurable icon.
- Separator turns from `○` to `●` while the balance is being requested, and stays `●` for 3 seconds after it finishes.
- Colors the balance by thresholds: green, yellow, or red.
- Refreshes on session start, after each agent turn settles, and every 5 minutes.
- Manual refresh with `/or-balance`.
- Shows `OR balance: n/a` and a warning notification if the request fails.
- No API key is stored in the extension. It is read from your existing pi config.

## Requirements

- pi coding agent with extension support.
- An OpenRouter API key.
- A provider named `openrouter-proxy` in `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "openrouter-proxy": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-v1-..."
    }
  }
}
```

The extension calls `GET {baseUrl}/credits` with `Authorization: Bearer <apiKey>` and computes:

```
balance = total_credits - total_usage
```

## Installation

Copy the extension into pi's extensions directory:

```bash
cp openrouter-balance.ts ~/.pi/agent/extensions/
```

Then restart pi, or run `/reload` if your version supports it.

## Configuration

Optional file `~/.pi/agent/openrouter-balance.json`. If it is missing, the defaults below are used.

```json
{
  "icon": "U+1F310",
  "thresholds": { "green": 20, "yellow": 5 }
}
```

| Key | Default | Meaning |
|---|---|---|
| `icon` | `U+1F310` | Symbol before `OR balance`. Use a Unicode code (`U+1F310` = 🌐, `U+2B55` = ⭕) or a literal character |
| `thresholds.green` | `20` | Balance at or above this value is green (`success`) |
| `thresholds.yellow` | `5` | Balance at or above this value (and below `green`) is yellow (`warning`). Lower is red (`error`) |

Colors come from your pi theme, so they follow the active theme.

## Usage

| Action | How |
|---|---|
| See balance | Look at the footer after session start |
| Refresh now | `/or-balance` |
| Stop polling | Automatic on session shutdown |

## Troubleshooting

| Symptom | Cause |
|---|---|
| `OR balance: n/a` + warning `provider "openrouter-proxy" not found` | Missing provider block in `models.json` |
| `OR balance: n/a` + warning `HTTP 401` | Invalid or revoked API key |
| `OR balance: n/a` + warning `HTTP 403` | Key without access to the `/credits` endpoint (use a regular key, not a restricted one) |
| Warning `openrouter-balance.json: ...` | Invalid JSON in the config file. Defaults are used until it is fixed |

## Changelog

### 0.3.0
- Separator `●` while the balance is loading and for 3 s after it finishes.
- Icon set by Unicode code in config (`"U+1F310"`), default 🌐 instead of ⭕.

### 0.2.0
- Icon before the balance (default `⭕`), configurable.
- Balance colored by thresholds, configurable in `openrouter-balance.json`.
- Separator `○` in the footer, same style as ponytail.

### 0.1.0
- Initial release: balance in the footer, `/or-balance` command, 5-minute refresh.

## License

MIT, see [LICENSE](LICENSE).
