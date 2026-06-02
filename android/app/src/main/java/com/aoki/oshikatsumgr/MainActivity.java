package com.aoki.oshikatsumgr;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int STATUS_BAR_COLOR = Color.WHITE;
    private static final int NAVIGATION_BAR_COLOR = Color.WHITE;
    private static final int WINDOW_BACKGROUND_COLOR = Color.rgb(248, 250, 252);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        polishSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        polishSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            polishSystemBars();
        }
    }

    private void polishSystemBars() {
        applySystemBarPolish();
        getWindow().getDecorView().post(this::applySystemBarPolish);
    }

    private void applySystemBarPolish() {
        Window window = getWindow();
        window.setStatusBarColor(STATUS_BAR_COLOR);
        window.setNavigationBarColor(NAVIGATION_BAR_COLOR);
        window.getDecorView().setBackgroundColor(WINDOW_BACKGROUND_COLOR);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        WindowCompat.setDecorFitsSystemWindows(window, true);

        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && window.getInsetsController() != null) {
            int lightSystemBars =
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            window.getInsetsController().setSystemBarsAppearance(lightSystemBars, lightSystemBars);
        }

        int systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systemUiVisibility |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        window.getDecorView().setSystemUiVisibility(systemUiVisibility);
    }
}
