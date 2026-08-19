package com.marginalia.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Receives the "Note down" action from the system text-selection toolbar
 * (used when reading a PDF or any other app and selecting text). It forwards
 * the selected text to the main app, which opens a capture screen for it.
 */
public class ProcessTextActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String text = "";
        Intent incoming = getIntent();
        if (incoming != null && Intent.ACTION_PROCESS_TEXT.equals(incoming.getAction())) {
            CharSequence seq = incoming.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            if (seq != null) text = seq.toString();
        }

        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (!text.trim().isEmpty()) {
            open.putExtra("pending_selected_text", text);
        }
        startActivity(open);
        finish();
    }
}
