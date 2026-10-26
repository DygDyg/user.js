# UserScripts

Each project gets its own folder: `scripts/<slug>/<slug>.user.js`, `README.md`, and optionally `assets/`.

Copy `templates/example.user.js` and `templates/README.md`, then register the script in `scripts.json`.

Example catalog entry:

```json
{
  "slug": "example",
  "name": "Example",
  "description": "What it does",
  "category": "Инструменты",
  "version": "0.1.0",
  "sites": ["example.com"]
}
```

The slug must contain only lowercase ASCII letters, digits and hyphens. Keep `@version` aligned with the catalog version. Review permissions and never commit secrets.
