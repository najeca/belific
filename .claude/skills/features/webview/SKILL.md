---
name: webview
description: Configure or debug the Belific WebView wrapper. Covers the live URL, loading states, and WebView props. Use when the WebView fails to load, shows wrong content, or needs a prop change.
---

# WebView

## Source of Truth

**URL:** `https://najeca.github.io/belific/`

> [!DANGER] Never change this URL without updating docs/decisions/001-webview-not-rewrite.md
> This is the only URL Belific loads. It is the live deployed web app.

## Critical Invariants

- URL must be lowercase `belific` — NOT `Belific` (GitHub Pages is case-sensitive)
- Never wrap the web app in a local bundle — always load the live URL
- Never modify `index.html`, `css/`, or `js/` from the mobile code — they are separate concerns
- See Decision [[001-webview-not-rewrite]]

## Standard WebView Props

```tsx
import { WebView } from 'react-native-webview';

<WebView
  source={{ uri: 'https://najeca.github.io/belific/' }}
  style={{ flex: 1 }}
  onError={(e) => console.log('WebView error:', e.nativeEvent)}
  startInLoadingState={true}
/>
```

## Debugging

**WebView won't load:**
1. Confirm device has internet connection
2. Confirm URL is `https://najeca.github.io/belific/` (lowercase, trailing slash)
3. Check `onError` output
4. Visit the URL in Safari on the device to confirm GitHub Pages is up

**WebView shows blank white screen:**
- Check `startInLoadingState={true}` is set
- Add `renderLoading` prop with an `ActivityIndicator`

**JavaScript not running in WebView:**
- Confirm `javaScriptEnabled={true}` (default is true, but check if overridden)
