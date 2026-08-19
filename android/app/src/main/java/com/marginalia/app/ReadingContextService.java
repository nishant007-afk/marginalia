package com.marginalia.app;

import android.accessibilityservice.AccessibilityService;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Captures the reading context of whatever app is in the foreground so notes
 * taken with the floating pen can be auto-linked to that page (book title,
 * author, page number, url). The user must enable this once in
 * Settings > Accessibility > Marginalia reading context.
 */
public class ReadingContextService extends AccessibilityService {

    public static final String REFRESH_ACTION = "com.marginalia.app.REFRESH_CONTEXT";
    private static final String PREFS = "reading_context";
    private static final String KEY_JSON = "json";
    private static final String OWN_PACKAGE = "com.marginalia.app";

    private static volatile String lastContextJson = null;

    private interface NodeVisitor {
        void visit(AccessibilityNodeInfo node, int depth);
    }

    private static final Pattern PAGE_PATTERN = Pattern.compile(
        "(?i)\\b(?:page|p\\.|pp\\.|p|pg\\.)\\s*\\d+"
    );
    private static final Pattern SLASH_PAGE_PATTERN = Pattern.compile(
        "\\b(\\d{1,4})\\s*/\\s*\\d{1,4}\\b"
    );
    private static final Pattern BY_PATTERN = Pattern.compile(
        "^(.*?)\\s+by\\s+([A-Z][\\w.'\\-]{1,40}(?:\\s+[A-Z][\\w.'\\-]{0,40}){0,2})$"
    );

    private final BroadcastReceiver refreshReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            captureNow(null);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        try {
            IntentFilter f = new IntentFilter(REFRESH_ACTION);
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                registerReceiver(refreshReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(refreshReceiver, f);
            }
            captureNow(null);
        } catch (Exception ignored) {}
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        try {
            if (event != null && event.getPackageName() != null
                    && OWN_PACKAGE.equals(event.getPackageName().toString())) {
                return;
            }
            captureNow(event);
        } catch (Exception ignored) {}
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        super.onDestroy();
        try { unregisterReceiver(refreshReceiver); } catch (Exception ignored) {}
    }

    /** Called by MainActivity / FloatingPenService to read the latest capture. */
    public static String getLastContextJson() {
        return lastContextJson;
    }

    private void captureNow(AccessibilityEvent ev) {
        try {
            String pkg = "";
            String title = "";

            if (ev != null && ev.getText() != null && !ev.getText().isEmpty()) {
                CharSequence ts = ev.getText().get(0);
                if (ts != null) title = ts.toString();
            }

            AccessibilityNodeInfo root = null;
            try { root = getRootInActiveWindow(); } catch (Exception ignored) {}

            if (root != null) {
                try {
                    pkg = root.getPackageName() != null ? root.getPackageName().toString() : "";
                } catch (Exception ignored) {}
                if (OWN_PACKAGE.equals(pkg)) return;
                if (title.isEmpty()) title = findTitleFromViews(root);
            }

            String cleanTitle = cleanTitle(title);
            StringBuilder text = new StringBuilder();
            String url = "";
            String page = "";
            if (root != null) {
                url = findUrl(root);
                page = findPage(root);
                collectText(root, text, new HashSet<>(), 600);
            }

            String[] ba = bookAuthor(cleanTitle);

            JSONObject o = new JSONObject();
            o.put("app", pkg);
            o.put("title", cleanTitle);
            o.put("url", url);
            o.put("page", page);
            o.put("book", ba[0]);
            o.put("author", ba[1]);
            String t = text.toString().trim();
            o.put("text", t.length() > 600 ? t.substring(0, 600) : t);

            String json = o.toString();
            lastContextJson = json;
            try {
                SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
                sp.edit().putString(KEY_JSON, json).apply();
            } catch (Exception ignored) {}
        } catch (Exception ignored) {}
    }

    private void visit(AccessibilityNodeInfo node, NodeVisitor visitor, int depth, Set<AccessibilityNodeInfo> seen) {
        if (node == null || depth > 12) return;
        if (!seen.add(node)) return;
        try { visitor.visit(node, depth); } catch (Exception ignored) {}
        for (int i = 0; i < node.getChildCount(); i++) {
            try { visit(node.getChild(i), visitor, depth + 1, seen); } catch (Exception ignored) {}
        }
    }

    private String findTitleFromViews(AccessibilityNodeInfo root) {
        final String[] best = new String[2];
        visit(root, (node, depth) -> {
            String viewId = node.getViewIdResourceName();
            CharSequence txt = node.getText();
            if (txt != null && txt.length() > 0 && txt.length() <= 200) {
                String s = txt.toString().trim();
                if (viewId != null && viewId.contains("title") && best[0] == null) {
                    best[0] = s;
                }
                if (best[1] == null && s.length() >= 3) best[1] = s;
            }
        }, 0, new HashSet<AccessibilityNodeInfo>());
        return best[0] != null ? best[0] : (best[1] != null ? best[1] : "");
    }

    private String findUrl(AccessibilityNodeInfo root) {
        final String[] found = new String[1];
        visit(root, (node, depth) -> {
            if (found[0] != null) return;
            String viewId = node.getViewIdResourceName();
            if (viewId != null && viewId.contains("url")) {
                CharSequence txt = node.getText();
                if (txt != null && txt.length() > 0) found[0] = txt.toString();
            }
        }, 0, new HashSet<AccessibilityNodeInfo>());
        return found[0] != null ? found[0] : "";
    }

    private String findPage(AccessibilityNodeInfo root) {
        final String[] found = new String[1];
        visit(root, (node, depth) -> {
            if (found[0] != null) return;
            CharSequence txt = node.getText();
            if (txt == null || txt.length() == 0 || txt.length() > 40) return;
            String s = txt.toString().trim();
            if (s.isEmpty()) return;
            Matcher m = PAGE_PATTERN.matcher(s);
            if (m.find()) { found[0] = m.group().trim(); return; }
            m = SLASH_PAGE_PATTERN.matcher(s);
            if (m.find()) { found[0] = m.group(); }
        }, 0, new HashSet<AccessibilityNodeInfo>());
        return found[0] != null ? found[0] : "";
    }

    private void collectText(AccessibilityNodeInfo root, StringBuilder out, Set<String> seen, int limit) {
        visit(root, (node, depth) -> {
            if (out.length() >= limit) return;
            CharSequence txt = node.getText();
            if (txt == null || txt.length() == 0) return;
            String s = txt.toString().trim();
            if (s.length() < 2 || !seen.add(s)) return;
            String viewId = node.getViewIdResourceName();
            if (viewId == null || !viewId.contains("loading")) {
                if (out.length() > 0) out.append("\n");
                out.append(s);
            }
        }, 0, new HashSet<AccessibilityNodeInfo>());
    }

    private String cleanTitle(String t) {
        if (t == null) return "";
        String s = t.trim();
        int dot = s.lastIndexOf('.');
        if (dot > 2 && s.length() - dot <= 5) s = s.substring(0, dot);
        s = s.replaceFirst("\\s+[\\-–—|·]\\s+[^\\-–—|·]*$", "").trim();
        if (s.length() > 160) s = s.substring(0, 160);
        return s;
    }

    private String[] bookAuthor(String title) {
        if (title == null || title.isEmpty()) return new String[]{"", ""};
        Matcher m = BY_PATTERN.matcher(title);
        if (m.matches()) {
            return new String[]{ m.group(1).trim(), m.group(2).trim() };
        }
        return new String[]{ title, "" };
    }
}