# shrinkling

![shrinkling](assets/promo.png)

**➡️ Try it: [dennismit2n.github.io/shrinkling](https://dennismit2n.github.io/shrinkling/)** &nbsp;·&nbsp; 🇩🇪 [Deutsche Version dieser Seite](README.de.md)

Shrink photos right in your browser. Drop images, pick a target ("email — max. 2 MB", "job portal — max. 1 MB", …), download the shrunk files. No upload, no server, no account — your photos never leave your device.

## Features

- 🎯 **One-click presets** — email (2 MB), application portals (1 MB), classifieds (1920 px), web (WebP) — plus free custom limits in KB/MB, pixels, format and quality
- 📦 **Batch** — drop many photos at once, download them all as a ZIP
- 🕵️ **Metadata removed** — GPS location, camera model and timestamps are stripped automatically
- 🖼️ **JPEG, PNG, WebP** — smart target-size search; transparency warning before it would be lost (HEIC works in Safari; other browsers show a friendly hint)
- 🌍 **12 languages** — Deutsch, English, Español, Français, Italiano, Português, Türkçe, Русский, हिन्दी, 中文, 日本語, 한국어 (auto-detected)
- 📱 **Installable PWA** — add it to your home screen; works fully offline
- 🔒 **Radically private** — everything happens in your browser

## Privacy

The whole app is a handful of static files. There is no server, no CDN, no cookies, no accounts. Images are decoded, resized and re-encoded locally via the Canvas API — turn on airplane mode and it still works. Don't take our word for it: open DevTools and watch the network tab, or read the source; it's all here.

Because every image is re-encoded, all EXIF metadata (GPS position, camera model, capture time) is removed as a side effect — by design.

*Analytics:* the app uses [GoatCounter](https://www.goatcounter.com) for anonymous, cookieless visit counting (disclosed in the footer). The script is vendored locally in `js/vendor/count.js`; the only external request is the count pixel. No personal data, no cookies, no cross-site tracking — and your images are never involved.

## Development

No build step, no dependencies.

```bash
node tools/dev-server.js
```

Then open http://localhost:8614. Edit, reload, done.

**When deploying:** bump the `CACHE` constant in [sw.js](sw.js) so installed clients pick up the new version immediately. (The service worker also refreshes cached assets in the background — stale-while-revalidate — so even a forgotten bump heals itself on the visitor's next visit.)

## Translations

Interface strings live in [js/i18n.js](js/i18n.js). Some translations are machine-generated — if something sounds off in your language, corrections via pull request or issue are very welcome!

## Roadmap ideas

- Cropping (profile pictures, passport photo sizes) — if users ask for it

## License

[MIT](LICENSE) for everything in this repository, with one exception: `js/vendor/count.js` is GoatCounter's counter script and is released under the ISC license, as stated in its file header.
