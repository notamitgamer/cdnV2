package dev.amit.cdn

/**
 * The Privacy Policy and Terms of Use, written for the app. They follow the website's pages
 * (app/templates/privacy.html and terms.html); the parts that differ are about the phone: what the app
 * stores locally and how it uploads. If you change the site's text, change it here too.
 *
 * Inline markup: **bold**, [label](https://link) opens the browser, [label](app:terms) opens another screen.
 */
sealed interface Block
data class Para(val text: String) : Block
data class Bullets(val items: List<String>) : Block

data class LegalSection(val heading: String, val blocks: List<Block>)

data class LegalDoc(val title: String, val intro: String, val sections: List<LegalSection>)

private const val ISSUES_URL = "https://github.com/notamitgamer/cdnV2/issues"
private const val GITHUB_URL = "https://github.com/notamitgamer"
private const val DISCORD_URL = "https://discord.com/users/1274721760088166495"
private const val SECURITY_URL = "https://github.com/notamitgamer/cdnV2/blob/main/SECURITY.md"

val PrivacyDoc = LegalDoc(
    title = "Privacy Policy",
    intro = "This is a personal CDN run by Amit Dutta, and this app is a client for it. The short version: " +
        "everything you upload is public, and I keep a few technical details about uploads so I can stop abuse. " +
        "The app has no ads, trackers or analytics. Last updated: November 2026.",
    sections = listOf(
        LegalSection(
            "Your files are public",
            listOf(
                Para(
                    "Anything you upload is public to the whole world, and anyone with the link can open it. " +
                        "Do not upload anything private, secret or personal. Because the files are public, they may also be " +
                        "cached, copied or shared by other people and services, and I can't take those copies back.",
                ),
            ),
        ),
        LegalSection(
            "If you only browse",
            listOf(
                Para(
                    "Browsing and downloading needs no account. The app has no ads, trackers or analytics, and it doesn't use " +
                        "cookies. It talks only to the CDN. Like any web server, the hosting and network providers below may see " +
                        "your IP address in their normal request logs.",
                ),
                Para(
                    "When the app opens a page, a raw file or a download in a browser tab, that tab is handled by your browser " +
                        "and its own policies.",
                ),
            ),
        ),
        LegalSection(
            "If you upload with the app or the website",
            listOf(
                Para(
                    "For each upload I record your IP address, the file name, size and path, the upload method, the user agent " +
                        "(for the app, a name that identifies the app and its version), and the time. I use this only to deal with " +
                        "abuse, for example to ban an address that uploads something harmful. I don't sell or share it.",
                ),
                Para(
                    "To block VPNs and proxies, your IP address is sent to proxycheck.io, a third-party lookup service, when you upload.",
                ),
                Para(
                    "When you upload from a link, the CDN's server downloads the file from that link itself.",
                ),
            ),
        ),
        LegalSection(
            "GitHub sync",
            listOf(
                Para(
                    "GitHub sync is a separate feature of the CDN and isn't part of this app. If you use it, I receive the OIDC " +
                        "token from your GitHub Actions run and read your GitHub username, account ID and repository names from it, " +
                        "plus the IP address of the request. I store these to approve, revoke or ban accounts. I don't get your " +
                        "password, your code, or anything else from your account.",
                ),
            ),
        ),
        LegalSection(
            "What stays on your phone",
            listOf(
                Para("The app keeps a few things in its own private storage on your phone:"),
                Bullets(
                    listOf(
                        "a saved copy of the file list, so the app opens faster",
                        "your history: the last 50 files you uploaded and the last 50 files or folders you opened",
                        "image previews the app has loaded",
                    ),
                ),
                Para(
                    "This data stays on your device and is not sent to me. You can clear the history with Clear on the History " +
                        "tab, or clear everything in your phone's app settings. Removing the app deletes it. Android may include " +
                        "the app's data in your phone's own device backup.",
                ),
            ),
        ),
        LegalSection(
            "Who else handles the data",
            listOf(
                Bullets(
                    listOf(
                        "**Hugging Face** stores the uploaded files.",
                        "**Render** hosts the website and its servers.",
                        "**proxycheck.io** checks upload IPs for VPNs and proxies.",
                        "**GitHub** provides the identity for GitHub sync.",
                    ),
                ),
                Para(
                    "These services have their own privacy policies. I may also look at uploaded files when needed, for example " +
                        "to check a report or remove abuse.",
                ),
            ),
        ),
        LegalSection(
            "How long I keep things",
            listOf(
                Para(
                    "I don't have a fixed deletion schedule. Upload records are kept for as long as I need them to handle abuse, " +
                        "and a ban record is kept for as long as the ban lasts. Uploaded files stay until I remove them.",
                ),
            ),
        ),
        LegalSection(
            "Removing a file or asking a question",
            listOf(
                Para(
                    "If you want a file removed, or you want to ask about your data, open an issue at [github.com/notamitgamer/cdnV2]($ISSUES_URL), " +
                        "message [@notamitgamer]($GITHUB_URL) on GitHub, or contact me on [Discord]($DISCORD_URL). I'll remove files " +
                        "that are illegal, abusive or that you uploaded yourself and want gone. Include the file's link so I can " +
                        "find it. Copies that others already made are out of my hands.",
                ),
            ),
        ),
        LegalSection(
            "Changes",
            listOf(
                Para(
                    "I may update this page and the app. The date at the top shows the latest version. This policy covers the " +
                        "app; the website has its own version at [${Config.PRIVACY_URL.removePrefix("https://")}](${Config.PRIVACY_URL}). " +
                        "See also the [Terms of Use](app:terms).",
                ),
            ),
        ),
    ),
)

val TermsDoc = LegalDoc(
    title = "Terms of Use",
    intro = "This is a free CDN run by Amit Dutta as a personal project. By uploading a file with this app, or using the " +
        "website's shortener or GitHub sync, you agree to these rules. If you only view or download files, these rules still " +
        "apply to how you use the service. Last updated: November 2026.",
    sections = listOf(
        LegalSection(
            "What you can upload",
            listOf(
                Para("Only upload files you own or have the right to share. You must not upload:"),
                Bullets(
                    listOf(
                        "anything illegal, including any sexual content involving minors",
                        "malware, phishing pages or anything built to harm people or devices",
                        "content that infringes someone's copyright or other rights",
                        "private or personal data about other people",
                        "video files, which this CDN doesn't accept",
                    ),
                ),
            ),
        ),
        LegalSection(
            "You are responsible for what you upload",
            listOf(
                Para(
                    "Everything you upload is public. You are responsible for it, including anything you upload through GitHub sync " +
                        "from your repositories. By uploading, you confirm you have the right to publish the file and you let this CDN " +
                        "store and serve it to anyone who asks.",
                ),
            ),
        ),
        LegalSection(
            "Fair use of the service",
            listOf(
                Para(
                    "Don't abuse the service. That means no attempts to bypass the upload checks, VPN block or rate limits, no " +
                        "flooding it with uploads or requests, no using it to host files for attacks, and no probing for weaknesses. " +
                        "To report a security problem, see the [security policy]($SECURITY_URL).",
                ),
            ),
        ),
        LegalSection(
            "What I can do",
            listOf(
                Para(
                    "I can remove any file, block any link or short URL, and ban any IP address or GitHub account at any time, " +
                        "with or without notice, if I think these rules are broken or the file puts the service at risk.",
                ),
            ),
        ),
        LegalSection(
            "No guarantees",
            listOf(
                Para(
                    "The service is free and provided as it is. Files can be lost, moved or deleted, and the site and app can go " +
                        "down or change without warning. Keep your own copy of anything that matters. To the extent the law allows, " +
                        "I'm not liable for lost files or for what other people upload or do with files from this CDN.",
                ),
            ),
        ),
        LegalSection(
            "Reporting a file",
            listOf(
                Para(
                    "If you see a file that breaks these rules, or one that infringes your rights, open an issue at " +
                        "[github.com/notamitgamer/cdnV2]($ISSUES_URL), message [@notamitgamer]($GITHUB_URL) on GitHub, or contact me " +
                        "on [Discord]($DISCORD_URL), and include the file's link. I'll look at it and remove it if it needs to go.",
                ),
            ),
        ),
        LegalSection(
            "Changes",
            listOf(
                Para(
                    "I may update these terms. Continuing to use the CDN after a change means you accept the new version. " +
                        "See also the [Privacy Policy](app:privacy).",
                ),
            ),
        ),
    ),
)
