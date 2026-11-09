# Discord button icons

Discord only allows a Unicode emoji or a **custom emoji** as a button icon, so the icons are uploaded as emoji.

1. In a Discord server you own: Server Settings -> Emoji -> Upload, and add the five `.png` files here
   (`download`, `raw`, `open`, `folder`, `zip`). The `.svg` files are the sources (Lucide icons, ISC licence).
2. In any chat type `\:download:` (backslash first) to get `<:download:1234567890>`; the number is the ID.
3. Set `DISCORD_EMOJI_IDS=download=<id>,raw=<id>,open=<id>,folder=<id>,zip=<id>` on the service.

Whether Discord shows emoji from a server the viewer isn't in is not documented for link previews; check it
with a second account that is not in your server.
