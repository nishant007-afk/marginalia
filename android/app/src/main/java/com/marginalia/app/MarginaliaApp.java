package com.marginalia.app;

import android.app.Application;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MarginaliaApp extends Application {
    public static MainActivity activity;

    @Override
    public void onCreate() {
        super.onCreate();

        Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, t) -> {
            appendCrashLog(t);
            if (prev != null) {
                prev.uncaughtException(thread, t);
            } else {
                Log.e("Marginalia", "Uncaught exception", t);
            }
        });
    }

    private void appendCrashLog(Throwable t) {
        try {
            File dir = new File(getFilesDir(), "logs");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "crash-log.txt");
            try (FileWriter w = new FileWriter(f, true)) {
                w.write("=== " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()) + "\n");
                w.write(String.valueOf(t) + "\n");
                for (StackTraceElement el : t.getStackTrace()) {
                    w.write("  at " + el + "\n");
                }
                if (t.getCause() != null) {
                    w.write("  Caused by: " + t.getCause() + "\n");
                    for (StackTraceElement el : t.getCause().getStackTrace()) {
                        w.write("    at " + el + "\n");
                    }
                }
                w.write("\n");
            }
            if (activity != null) {
                try {
                    File copy = new File(activity.getExternalFilesDir(null), "Marginalia-crash-log.txt");
                    java.io.FileInputStream in = new java.io.FileInputStream(f);
                    java.io.FileOutputStream out = new java.io.FileOutputStream(copy);
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    in.close();
                    out.close();
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
    }
}