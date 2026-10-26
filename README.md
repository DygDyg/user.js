# UserJS Hub

A curated collection of browser userscripts by DygDyg.

**[Website (GitHub Pages)](https://dygdyg.github.io/user.js/)** · **[Scripts](scripts/)** · **[Template](templates/example.user.js)**

## Features

- Responsive dark-mode catalog with search and category filters
- Separate folder and documentation for each script
- One-click userscript install links
- GitHub Actions deployment to GitHub Pages
- Tampermonkey and Violentmonkey compatible template

## Add a script

1. Create `scripts/<slug>/<slug>.user.js` and `scripts/<slug>/README.md`.
2. Use `templates/example.user.js` as a starting point.
3. Set the `@match` and `@grant` directives, plus `@downloadURL` and `@updateURL` to raw GitHub URLs.
4. Register the script in `scripts.json` with slug, name, description, category, version and sites.
5. Push to `main`. The Pages workflow will publish the updated catalog.

## Enable GitHub Pages

Go to **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow `.github/workflows/pages.yml` publishes the site on pushes to `main`.

## Repository layout

```text
.github/workflows/pages.yml
docs/index.html
docs/style.css
docs/app.js
scripts/README.md
templates/example.user.js
templates/README.md
scripts.json
```

The catalog starts empty until real scripts are added.

## License

MIT.
