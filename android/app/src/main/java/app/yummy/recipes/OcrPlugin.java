package app.yummy.recipes;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/** On-device OCR for cookbook pages and recipe cards. No cloud, no account. */
@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {

    @PluginMethod
    public void recognize(PluginCall call) {
        String base64 = call.getString("image");
        if (base64 == null || base64.isEmpty()) {
            call.reject("No image supplied");
            return;
        }
        int comma = base64.indexOf(',');
        if (comma >= 0) {
            base64 = base64.substring(comma + 1);
        }
        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = false;
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Throwable t) {
            call.reject("Could not read that photo");
            return;
        }
        if (bitmap == null) {
            call.reject("Could not read that photo");
            return;
        }
        if (Math.max(bitmap.getWidth(), bitmap.getHeight()) > 2200) {
            float scale = 2200f / Math.max(bitmap.getWidth(), bitmap.getHeight());
            Bitmap scaled = Bitmap.createScaledBitmap(
                    bitmap,
                    Math.round(bitmap.getWidth() * scale),
                    Math.round(bitmap.getHeight() * scale),
                    true);
            bitmap.recycle();
            bitmap = scaled;
        }

        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        InputImage image = InputImage.fromBitmap(bitmap, 0);
        recognizer.process(image)
                .addOnSuccessListener(result -> {
                    JSObject out = new JSObject();
                    out.put("text", result.getText());
                    call.resolve(out);
                    recognizer.close();
                })
                .addOnFailureListener(error -> {
                    call.reject("OCR failed: " + error.getMessage());
                    recognizer.close();
                });
    }
}
