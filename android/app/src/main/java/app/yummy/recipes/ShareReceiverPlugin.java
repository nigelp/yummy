package app.yummy.recipes;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives recipes shared from Chrome or any other app via ACTION_SEND.
 * The text is queued until the UI subscribes, so sharing cold-starts cleanly.
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static ShareReceiverPlugin instance;
    private static String pendingText;

    @Override
    public void load() {
        instance = this;
        flush();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    public static void receive(String text) {
        if (text == null || text.trim().isEmpty()) {
            return;
        }
        pendingText = text.trim();
        if (instance != null) {
            instance.flush();
        }
    }

    private void flush() {
        if (pendingText == null) {
            return;
        }
        JSObject payload = new JSObject();
        payload.put("text", pendingText);
        pendingText = null;
        notifyListeners("shared", payload);
    }

    @PluginMethod
    public void getShared(PluginCall call) {
        JSObject out = new JSObject();
        out.put("text", pendingText);
        pendingText = null;
        call.resolve(out);
    }
}
