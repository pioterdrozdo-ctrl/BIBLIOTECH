package com.bibliotech.app;

import android.net.Uri;

import androidx.annotation.NonNull;

/**
 * Opens the production BIBLIOTECH PWA as a Trusted Web Activity.
 * All books, accounts, rentals and comments stay on the shared Render backend.
 */
public final class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final Uri START_URL = Uri.parse(
            "https://bibliotech-rjfu.onrender.com/home.html?source=android"
    );

    @NonNull
    @Override
    protected Uri getLaunchingUrl() {
        return START_URL;
    }
}
