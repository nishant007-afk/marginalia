package com.marginalia.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import android.content.pm.ServiceInfo;

public class FloatingPenService extends Service {

    private WindowManager windowManager;
    private View penView;
    private View panelView;
    private WindowManager.LayoutParams penParams;
    private WindowManager.LayoutParams panelParams;
    private boolean panelOpen = false;
    private int penSize;
    private int panelWidth;
    private int panelHeight;
    private String selectedCategory = "observe";
    private static final String CHANNEL_ID = "marginalia_pen";

    private static final String[][] CATEGORIES = {
        {"observe", "Observe", "What did you notice?"},
        {"image", "Images", "What image stayed with you?"},
        {"connection", "Connections", "What does this remind you of?"},
        {"feeling", "Feelings", "What did this make you feel?"},
        {"idea", "Ideas", "What thought came to you?"},
        {"line", "Lines", "A line of your own?"},
        {"draft", "Drafts", "Write a little."},
        {"poem", "Poems", "A finished piece."}
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
            createNotificationChannel();
            createPenView();
            createPanelView();
        } catch (Exception e) {
            // Never let a setup failure take the app's process down.
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if ("STOP".equals(intent != null ? intent.getAction() : null)) {
                removeViews();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }

            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(1, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(1, buildNotification());
            }

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    if (penView.getWindowToken() == null) {
                        windowManager.addView(penView, penParams);
                    }
                } catch (Exception e) {
                    try {
                        windowManager.addView(penView, penParams);
                    } catch (Exception ignored) {}
                }
            }, 200);

            return START_STICKY;
        } catch (Exception e) {
            return START_STICKY;
        }
    }

    private void createPenView() {
        penSize = dpToPx(52);

        FrameLayout container = new FrameLayout(this);
        container.setLayoutParams(new FrameLayout.LayoutParams(penSize, penSize));

        // Gold circle background
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#D4A853"));
        container.setBackground(bg);

        // Pen icon (the same pen-nib mark as the app icon), inset so it fits
        // comfortably inside the gold circle instead of stretching edge to edge.
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_pen);
        int iconSize = Math.round(penSize * 0.56f);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(iconSize, iconSize);
        iconParams.gravity = Gravity.CENTER;
        icon.setLayoutParams(iconParams);
        container.addView(icon);

        penParams = new WindowManager.LayoutParams(
            penSize, penSize,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        penParams.gravity = Gravity.TOP | Gravity.START;
        penParams.x = dpToPx(12);
        penParams.y = getScreenHeight() / 2;

        // Make pen draggable
        container.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;
            private boolean moved = false;
            private static final int CLICK_THRESHOLD = 10;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = penParams.x;
                        initialY = penParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        moved = false;
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float dx = event.getRawX() - initialTouchX;
                        float dy = event.getRawY() - initialTouchY;
                        if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) {
                            moved = true;
                        }
                        penParams.x = initialX + (int) dx;
                        penParams.y = initialY + (int) dy;
                        penParams.x = Math.max(0, Math.min(getScreenWidth() - penSize, penParams.x));
                        penParams.y = Math.max(0, Math.min(getScreenHeight() - penSize - dpToPx(80), penParams.y));
                        try {
                            windowManager.updateViewLayout(penView, penParams);
                        } catch (Exception ignored) {}
                        if (panelOpen) repositionPanel();
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            togglePanel();
                        }
                        return true;
                }
                return false;
            }
        });

        penView = container;
    }

    private void createPanelView() {
        panelView = buildPanelLayout();

        panelWidth = dpToPx(300);
        panelHeight = dpToPx(420);

        panelParams = new WindowManager.LayoutParams(
            panelWidth, panelHeight,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        );
        panelParams.gravity = Gravity.TOP | Gravity.START;
        panelParams.x = dpToPx(12);
        panelParams.y = getScreenHeight() / 2 - panelHeight / 2;
    }

    /** Anchor the panel to the pen's current position, clamped to the screen. */
    private void repositionPanel() {
        if (panelParams == null) return;
        int gap = dpToPx(10);
        int x = penParams.x + penSize + gap;
        if (x + panelWidth > getScreenWidth()) {
            x = penParams.x - panelWidth - gap;
        }
        x = Math.max(0, Math.min(getScreenWidth() - panelWidth, x));
        int y = penParams.y;
        y = Math.max(0, Math.min(getScreenHeight() - panelHeight - dpToPx(40), y));
        panelParams.x = x;
        panelParams.y = y;
        try {
            windowManager.updateViewLayout(panelView, panelParams);
        } catch (Exception ignored) {}
    }

    private View buildPanelLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dpToPx(16), dpToPx(12), dpToPx(16), dpToPx(12));

        GradientDrawable rootBg = new GradientDrawable();
        rootBg.setCornerRadius(dpToPx(16));
        rootBg.setColor(Color.parseColor("#1A1A1A"));
        rootBg.setStroke(1, Color.parseColor("#222222"));
        root.setBackground(rootBg);

        // Header
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText("Quick capture");
        title.setTextColor(Color.parseColor("#E8E8E8"));
        title.setTextSize(14);
        title.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(title);

        TextView doneBtn = new TextView(this);
        doneBtn.setText("Done");
        doneBtn.setTextColor(Color.parseColor("#D4A853"));
        doneBtn.setTextSize(13);
        doneBtn.setPadding(dpToPx(10), dpToPx(6), dpToPx(10), dpToPx(6));
        GradientDrawable doneBg = new GradientDrawable();
        doneBg.setCornerRadius(dpToPx(8));
        doneBg.setColor(Color.parseColor("#1A1A1A"));
        doneBg.setStroke(1, Color.parseColor("#D4A853"));
        doneBtn.setBackground(doneBg);
        doneBtn.setOnClickListener(v -> closePanel());
        header.addView(doneBtn);
        root.addView(header);

        // Prompt text (declare BEFORE chips so chip handlers can reference it)
        final TextView prompt = new TextView(this);
        prompt.setText(CATEGORIES[0][2]);
        prompt.setTextColor(Color.parseColor("#D4A853"));
        prompt.setTextSize(13);
        prompt.setPadding(0, dpToPx(8), 0, dpToPx(4));
        root.addView(prompt);

        // Category chips (horizontally scrollable so all of them fit)
        HorizontalScrollView chipsScroll = new HorizontalScrollView(this);
        chipsScroll.setHorizontalScrollBarEnabled(false);
        chipsScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        chipsScroll.setFillViewport(false);

        LinearLayout chipsRow = new LinearLayout(this);
        chipsRow.setOrientation(LinearLayout.HORIZONTAL);
        chipsRow.setPadding(0, dpToPx(4), 0, 0);

        for (String[] cat : CATEGORIES) {
            TextView chip = new TextView(this);
            chip.setText(cat[1]);
            chip.setTextSize(11);
            chip.setTextColor(Color.parseColor("#666666"));
            chip.setPadding(dpToPx(10), dpToPx(5), dpToPx(10), dpToPx(5));
            GradientDrawable chipBg = new GradientDrawable();
            chipBg.setCornerRadius(dpToPx(20));
            chipBg.setColor(Color.TRANSPARENT);
            chipBg.setStroke(1, Color.parseColor("#333333"));
            chip.setBackground(chipBg);

            final String catKey = cat[0];
            final String catPrompt = cat[2];
            final LinearLayout chipsRowRef = chipsRow;
            chip.setOnClickListener(v -> {
                selectedCategory = catKey;
                for (int i = 0; i < chipsRowRef.getChildCount(); i++) {
                    TextView c = (TextView) chipsRowRef.getChildAt(i);
                    GradientDrawable cb = (GradientDrawable) c.getBackground();
                    if (i == indexOfCategory(catKey)) {
                        c.setTextColor(Color.parseColor("#D4A853"));
                        cb.setColor(Color.parseColor("#1A1A1A"));
                        cb.setStroke(1, Color.parseColor("#D4A853"));
                    } else {
                        c.setTextColor(Color.parseColor("#666666"));
                        cb.setColor(Color.TRANSPARENT);
                        cb.setStroke(1, Color.parseColor("#333333"));
                    }
                }
                prompt.setText(catPrompt);
            });

            LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            chipParams.setMarginEnd(dpToPx(6));
            chipsRow.addView(chip, chipParams);
        }
        chipsScroll.addView(chipsRow);
        root.addView(chipsScroll);

        // Text input
        EditText input = new EditText(this);
        input.setHint("Write here...");
        input.setHintTextColor(Color.parseColor("#666666"));
        input.setTextColor(Color.parseColor("#E8E8E8"));
        input.setTextSize(15);
        input.setMinLines(3);
        input.setMaxLines(5);
        input.setGravity(android.view.Gravity.TOP);
        input.setPadding(dpToPx(12), dpToPx(10), dpToPx(12), dpToPx(10));
        GradientDrawable inputBg = new GradientDrawable();
        inputBg.setCornerRadius(dpToPx(12));
        inputBg.setColor(Color.parseColor("#222222"));
        inputBg.setStroke(1, Color.parseColor("#333333"));
        input.setBackground(inputBg);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        inputParams.setMargins(0, dpToPx(6), 0, 0);
        root.addView(input, inputParams);

        // Save button
        TextView saveBtn = new TextView(this);
        saveBtn.setText("Save");
        saveBtn.setTextColor(Color.parseColor("#111111"));
        saveBtn.setTextSize(14);
        saveBtn.setGravity(Gravity.CENTER);
        saveBtn.setPadding(dpToPx(20), dpToPx(10), dpToPx(20), dpToPx(10));
        GradientDrawable saveBg = new GradientDrawable();
        saveBg.setCornerRadius(dpToPx(12));
        saveBg.setColor(Color.parseColor("#D4A853"));
        saveBtn.setBackground(saveBg);
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        saveParams.gravity = Gravity.END;
        saveParams.setMargins(0, dpToPx(10), 0, 0);
        root.addView(saveBtn, saveParams);

        saveBtn.setOnClickListener(v -> {
            String text = input.getText().toString().trim();
            if (!text.isEmpty()) {
                saveNoteToApp(selectedCategory, text);
                input.setText("");
                closePanel();
            }
        });

        return root;
    }

    private void saveNoteToApp(String category, String content) {
        // Try to save via the WebView
        if (MarginaliaApp.activity != null) {
            MarginaliaApp.activity.runOnUiThread(() -> {
                if (MarginaliaApp.activity.webView != null) {
                    String escapedContent = content.replace("\\", "\\\\")
                        .replace("'", "\\'")
                        .replace("\n", "\\n")
                        .replace("\r", "");
                    String js = String.format(
                        "document.dispatchEvent(new CustomEvent('android-save-note', {detail:{category:'%s',content:'%s'}}));",
                        category, escapedContent);
                    MarginaliaApp.activity.webView.evaluateJavascript(js, null);
                }
            });
        }

        // Also broadcast in case activity isn't available
        Intent intent = new Intent("com.marginalia.SAVE_NOTE");
        intent.putExtra("category", category);
        intent.putExtra("content", content);
        sendBroadcast(intent);
    }

    private void togglePanel() {
        if (panelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    private void openPanel() {
        if (!panelOpen) {
            try {
                repositionPanel();
                windowManager.addView(panelView, panelParams);
                panelOpen = true;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void closePanel() {
        if (panelOpen) {
            try {
                windowManager.removeView(panelView);
                panelOpen = false;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void removeViews() {
        try { windowManager.removeView(penView); } catch (Exception ignored) {}
        closePanel();
    }

    private int indexOfCategory(String key) {
        for (int i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i][0].equals(key)) return i;
        }
        return 0;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Floating Pen",
                NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows the floating pen icon");
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
            .setContentTitle("Marginalia")
            .setContentText("Tap the pen to capture a note")
            .setSmallIcon(android.R.drawable.ic_menu_edit)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
    }

    private int dpToPx(int dp) {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        return Math.round(dp * dm.density);
    }

    private int getScreenWidth() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        return dm.widthPixels;
    }

    private int getScreenHeight() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        return dm.heightPixels;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        removeViews();
    }
}
