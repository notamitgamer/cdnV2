"""Optional Discord bot: replies to CDN links with Copy / Download / Raw buttons.

Off unless DISCORD_BOT_TOKEN is set. It runs inside the web app's event loop, so it needs no extra service.
Enable the "Message Content" privileged intent for the bot in the Discord developer portal.

Env:
  DISCORD_BOT_TOKEN   bot token (required to turn the bot on)
  DISCORD_LINK_HOSTS  extra comma-separated hosts to react to (e.g. a preview deploy); CDN_BASE_URL's host is always included
  DISCORD_GUILD_IDS   optional comma-separated server IDs; when set, the bot ignores every other server
"""

import asyncio
import logging
import os
import re
from urllib.parse import quote, unquote, urlparse

import discord

from .storage import format_size, get_path_info, list_directory

log = logging.getLogger("cdn.discord")

URL_RE = re.compile(r"https?://[^\s<>()\[\]|]+", re.I)
MAX_LINKS_PER_MESSAGE = 3
# Routes of the web UI/API that are not files or folders.
RESERVED_FIRST_SEGMENTS = {
    "api", "static", "mask", "pack", "admin", "stats", "new", "find", "history", "privacy",
    "documentation", "gh-sync", "shorten", "ping", "raw", "favicon.ico",
}
COPY_ID = "cdnbot:copy"


def extract_paths(text: str, hosts: set[str]) -> list[str]:
    """Unique CDN paths (no query/fragment, URL-decoded) for links in `text` whose host is in `hosts`."""
    out: list[str] = []
    for m in URL_RE.finditer(text or ""):
        u = urlparse(m.group(0).rstrip(".,;:!?'\""))
        if (u.hostname or "").lower() not in hosts:
            continue
        path = unquote(u.path).strip("/")
        if not path or path.split("/")[0] in RESERVED_FIRST_SEGMENTS or ".." in path.split("/"):
            continue
        if path not in out:
            out.append(path)
        if len(out) >= MAX_LINKS_PER_MESSAGE:
            break
    return out


def _enc(path: str) -> str:
    return quote(path, safe="/")


class CopyView(discord.ui.View):
    """Registered once so the Copy button keeps working on old messages after a restart."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Copy", style=discord.ButtonStyle.primary, custom_id=COPY_ID)
    async def copy(self, interaction: discord.Interaction, button: discord.ui.Button):
        # The primary link is read back from the message's own link buttons, so no state is stored.
        target = None
        for row in interaction.message.components:
            for child in getattr(row, "children", []):
                if getattr(child, "label", None) in ("Raw", "Open") and getattr(child, "url", None):
                    target = child.url
                    if child.label == "Raw":
                        break
        if not target:
            await interaction.response.send_message("Link not found.", ephemeral=True)
            return
        await interaction.response.send_message(f"```\n{target}\n```", ephemeral=True)


async def _build_reply(path: str, cdn: str, raw: str):
    """(text, view) for a file or folder link, or None when the path is neither."""
    info = await get_path_info(path)
    view = CopyView()
    if info.get("exists"):
        name = path.rsplit("/", 1)[-1]
        size = info.get("size")
        text = f"`{name}`" + (f" · {format_size(size)}" if size else "")
        view.add_item(discord.ui.Button(label="Download", url=f"{cdn}/api/get/{_enc(path)}"))
        view.add_item(discord.ui.Button(label="Raw", url=f"{raw}/{_enc(path)}"))
        return text, view
    items = await list_directory(path)
    if not items:
        return None
    text = f"`{path.rsplit('/', 1)[-1]}/` · {len(items)} item{'' if len(items) == 1 else 's'}"
    view.add_item(discord.ui.Button(label="Download zip", url=f"{cdn}/api/pack/{_enc(path)}"))
    view.add_item(discord.ui.Button(label="Open", url=f"{cdn}/{_enc(path)}/"))
    return text, view


def start_bot(cdn_base_url: str, raw_base_url: str):
    """Start the bot as a background task if DISCORD_BOT_TOKEN is set. Returns the task or None."""
    token = os.getenv("DISCORD_BOT_TOKEN", "").strip()
    if not token:
        return None

    cdn, raw = cdn_base_url.rstrip("/"), raw_base_url.rstrip("/")
    hosts = {(urlparse(cdn).hostname or "").lower()}
    hosts |= {h.strip().lower() for h in os.getenv("DISCORD_LINK_HOSTS", "").split(",") if h.strip()}
    guilds = {int(g) for g in os.getenv("DISCORD_GUILD_IDS", "").replace(" ", "").split(",") if g.isdigit()}

    intents = discord.Intents.default()
    intents.message_content = True

    class Bot(discord.Client):
        async def setup_hook(self):
            self.add_view(CopyView())

        async def on_ready(self):
            log.info("Discord bot ready as %s", self.user)

        async def on_message(self, message: discord.Message):
            if message.author.bot or message.guild is None:
                return
            if guilds and message.guild.id not in guilds:
                return
            paths = extract_paths(message.content, hosts)
            for path in paths:
                try:
                    built = await _build_reply(path, cdn, raw)
                    if built:
                        text, view = built
                        await message.reply(text, view=view, mention_author=False, silent=True)
                except Exception:
                    log.exception("Could not reply for %s", path)

    client = Bot(intents=intents)

    async def run():
        try:
            await client.start(token)
        except Exception:
            log.exception("Discord bot stopped")

    return asyncio.create_task(run())
