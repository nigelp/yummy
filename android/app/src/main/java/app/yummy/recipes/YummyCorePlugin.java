package app.yummy.recipes;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * One bridge, one call: everything the recipe brain does lives in Rust.
 * The JS side sends { method, payload } and gets back the JSON envelope.
 */
@CapacitorPlugin(name = "YummyCore")
public class YummyCorePlugin extends Plugin {

    static {
        System.loadLibrary("yummy_core");
    }

    private native String nativeCall(String method, String payload);

    @PluginMethod
    public void call(PluginCall call) {
        String method = call.getString("method", "");
        JSObject payloadObject = call.getObject("payload");
        String payload = payloadObject == null ? "{}" : payloadObject.toString();
        try {
            String result = nativeCall(method, payload);
            JSObject out = new JSObject();
            out.put("raw", result);
            call.resolve(out);
        } catch (Throwable t) {
            call.reject("Recipe engine error: " + t.getMessage());
        }
    }
}
