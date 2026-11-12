package dev.amit.cdn

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class UiState(
    val files: List<FileRec>? = null,
    val loading: Boolean = true,
    val error: String? = null,
)

class CdnViewModel(app: Application) : AndroidViewModel(app) {
    private val api = CdnApi(app.cacheDir)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        refresh(showCachedFirst = true)
    }

    fun refresh(showCachedFirst: Boolean = false) {
        viewModelScope.launch {
            if (showCachedFirst) {
                api.cachedTree()?.let { _state.value = UiState(files = it, loading = true) }
            } else {
                _state.value = _state.value.copy(loading = true, error = null)
            }
            try {
                _state.value = UiState(files = api.loadTree(), loading = false)
            } catch (e: Exception) {
                // Keep whatever we already showed; just tell the user the refresh failed.
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Could not load files")
            }
        }
    }
}
