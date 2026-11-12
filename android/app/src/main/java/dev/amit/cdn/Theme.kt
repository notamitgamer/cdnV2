package dev.amit.cdn

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** The website's dark tokens (app/static/app.css, section 1), so the app and the site match. */
object Tokens {
    val Bg = Color(0xFF1E1F23)
    val Surface = Color(0xFF232428)
    val Surface2 = Color(0xFF2C2D31)
    val Border = Color(0xFF303338)
    val BorderStrong = Color(0xFF515256)
    val Text = Color(0xFFF1F1F1)
    val Muted = Color(0xFFB6B6B6)
    val Accent = Color(0xFF9AD2ED)
    val AccentSolid = Color(0xFF466371)
    val Danger = Color(0xFFFF7B72)
    val OnSolid = Color(0xFFFFFFFF)
}

private val Square = RoundedCornerShape(0.dp)

@Composable
fun CdnTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Tokens.Accent,
            onPrimary = Tokens.Bg,
            secondary = Tokens.AccentSolid,
            onSecondary = Tokens.OnSolid,
            background = Tokens.Bg,
            onBackground = Tokens.Text,
            surface = Tokens.Surface,
            onSurface = Tokens.Text,
            surfaceVariant = Tokens.Surface2,
            onSurfaceVariant = Tokens.Muted,
            surfaceContainer = Tokens.Surface,
            surfaceContainerHigh = Tokens.Surface2,
            outline = Tokens.BorderStrong,
            outlineVariant = Tokens.Border,
            error = Tokens.Danger,
        ),
        // Square corners everywhere, like the site.
        shapes = Shapes(
            extraSmall = Square,
            small = Square,
            medium = Square,
            large = Square,
            extraLarge = Square,
        ),
        content = content,
    )
}
