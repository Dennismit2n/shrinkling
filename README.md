# shrinkling

![shrinkling](assets/promo.png)

**➡️ Try it: [dennismit2n.github.io/shrinkling](https://dennismit2n.github.io/shrinkling/)** &nbsp;·&nbsp; 🇩🇪 [Deutsche Version dieser Seite](README.de.md)

Shrink photos right in your browser. Drop images, pick a target ("email — max. 2 MB", "job portal — max. 1 MB", …), download the shrunk files. No upload, no server, no account — your photos never leave your device.

## Features

- 🎯 **One-click presets** — email (2 MB), application portals (1 MB), classifieds (1920 px), web (WebP) — plus free custom limits in KB/MB, pixels, format and quality
- 📦 **Batch** — drop many photos at once, download them all as a ZIP
- 🕵️ **Metadata removed** — GPS location, camera model and timestamps are stripped automatically
- 🖼️ **JPEG, PNG, WebP** — smart target-size search; transparency warning before it would be lost (HEIC works in Safari; other browsers show a friendly hint)
- 🌍 **9 languages** — Deutsch, English, Español, Français, Italiano, Türkçe, हिन्दी, 中文, 日本語 (auto-detected)
- 📱 **Installable PWA** — add it to your home screen; works fully offline
- 🔒 **Radically private** — everything happens in your browser

## Privacy

The whole app is a handful of static files. There is no server, no CDN, no cookies, no tracking. Images are decoded, resized and re-encoded locally via the Canvas API — turn on airplane mode and it still works. Don't take our word for it: open DevTools and watch the network tab, or read the source; it's all here.

Because every image is re-encoded, all EXIF metadata (GPS position, camera model, capture time) is removed as a side effect — by design.

*Optional analytics:* the app is prepared for [GoatCounter](https://www.goatcounter.com) (anonymous, cookieless visit counting, disclosed in the footer). It is currently **not enabled**.

## Development

No build step, no dependencies.

```bash
node tools/dev-server.js
```

Then open http://localhost:8614. Edit, reload, done.

## Translations

Interface strings live in [js/i18n.js](js/i18n.js). Some translations are machine-generated — if something sounds off in your language, corrections via pull request or issue are very welcome!

## Roadmap ideas

- Cropping (profile pictures, passport photo sizes) — if users ask for it

## License

[MIT](LICENSE)
