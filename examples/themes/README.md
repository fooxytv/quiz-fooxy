# Making your own theme

Drop a `.json` file into the **data volume** at `themes/`, then open the Themes
tab on the host screen — no rebuild, no restart.

```bash
# find the volume on the server
docker volume inspect marvel-quiz_quiz-data

# or copy a file straight into the running container
docker cp my-theme.json marvel-quiz:/data/themes/my-theme.json
docker cp backdrop.jpg  marvel-quiz:/data/assets/backdrop.jpg
```

## Fields

| field | |
|---|---|
| `id` | lowercase slug, unique. Reusing a built-in id replaces it. |
| `name` | what the Themes tab shows |
| `blurb` | one line of description |
| `scene` | `comic` or `cosmic` — which background animation to run |
| `wordmark.lead` / `.tail` | the two halves of the name in the header |
| `intro` | optional title card: `title`, `subtitle`, `everyMs` (6000–120000) |
| `palette` | hex colours for any of the themeable tokens below |
| `paletteDark` | overrides applied only when the viewer prefers dark |
| `backdropImage` | a filename in `assets/`, layered behind the scene |

Themeable tokens: `paper`, `surface`, `sunk`, `ink`, `muted`, `hair`, `red`,
`gold`, `green`, `azure`, `tile-edge`, `on-solid`, `panel-shadow`.

Anything else in the file is ignored, and a bad colour is rejected with a reason
in the server log rather than breaking the page — only hex values are accepted,
so a theme can never inject CSS.

## A note on artwork

The two built-in scenes are drawn in code, so nothing ships with a frame, still
or logo from anyone's film. `backdropImage` loads whatever you put in `assets/`;
what you are entitled to use there is your call.

If you want a film-styled look without that question, lean on the palette, the
wordmark and the intro copy — most of the atmosphere comes from colour, type and
motion, not from a photograph.
