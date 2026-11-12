package dev.amit.cdn

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** A full-screen page with a back arrow, used for the legal pages and About. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubScreen(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    BackHandler(onBack = onBack)
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = { Text(title) },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) { content() }
    }
}

/**
 * Turns the small markup used in [LegalDoc] into styled text: **bold**, [label](https://…) for a web link,
 * and [label](app:screen) for a link to another screen of the app.
 */
fun rich(src: String, linkColor: Color, onNavigate: (String) -> Unit): AnnotatedString {
    val style = TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline))
    val pattern = Regex("""\*\*(.+?)\*\*|\[(.+?)]\((.+?)\)""")
    return buildAnnotatedString {
        var last = 0
        for (m in pattern.findAll(src)) {
            append(src.substring(last, m.range.first))
            val bold = m.groups[1]?.value
            if (bold != null) {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(bold) }
            } else {
                val label = m.groups[2]?.value.orEmpty()
                val target = m.groups[3]?.value.orEmpty()
                if (target.startsWith("app:")) {
                    val screen = target.removePrefix("app:")
                    val link = LinkAnnotation.Clickable(
                        tag = screen,
                        styles = style,
                        linkInteractionListener = LinkInteractionListener { onNavigate(screen) },
                    )
                    withLink(link) { append(label) }
                } else {
                    withLink(LinkAnnotation.Url(target, style)) { append(label) }
                }
            }
            last = m.range.last + 1
        }
        append(src.substring(last))
    }
}

@Composable
fun LegalScreen(doc: LegalDoc, onBack: () -> Unit, onNavigate: (String) -> Unit) {
    val link = MaterialTheme.colorScheme.primary
    SubScreen(doc.title, onBack) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(rich(doc.intro, link, onNavigate), color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 22.sp)
            doc.sections.forEach { section ->
                Text(
                    section.heading,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 17.sp,
                    modifier = Modifier.padding(top = 12.dp),
                )
                section.blocks.forEach { block ->
                    when (block) {
                        is Para -> Text(rich(block.text, link, onNavigate), lineHeight = 22.sp)
                        is Bullets -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            block.items.forEach { item ->
                                Row {
                                    Text("•", modifier = Modifier.padding(end = 10.dp, start = 4.dp))
                                    Text(rich(item, link, onNavigate), lineHeight = 22.sp, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
            Box(Modifier.padding(bottom = 24.dp))
        }
    }
}

/** App name, version and the places to read more or get in touch. */
@Composable
fun AboutScreen(onBack: () -> Unit, onNavigate: (String) -> Unit) {
    val context = LocalContext.current
    val version = remember {
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty()
        } catch (e: Exception) {
            ""
        }
    }
    SubScreen("About", onBack) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("amit/cdn", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                if (version.isNotEmpty()) {
                    Text(
                        "Version $version",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    "A native app for browsing the CDN, uploading to it and copying links. Everything uploaded is public.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            AboutRow("Privacy Policy") { onNavigate("privacy") }
            AboutRow("Terms of Use") { onNavigate("terms") }
            AboutRow("Documentation") { openInBrowser(context, Config.DOCS_URL) }
            AboutRow("GitHub sync") { openInBrowser(context, Config.SYNC_DOCS_URL) }
            AboutRow("Source code and issues") { openInBrowser(context, "https://github.com/notamitgamer/cdnV2") }
            AboutRow("Report a file or ask a question") { openInBrowser(context, "https://github.com/notamitgamer/cdnV2/issues") }
        }
    }
}

@Composable
private fun AboutRow(label: String, onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label)
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}
