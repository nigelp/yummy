use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;

/// Kotlin/Java side: `app.yummy.recipes.YummyCorePlugin.nativeCall(method, payloadJson)`.
#[no_mangle]
pub extern "system" fn Java_app_yummy_recipes_YummyCorePlugin_nativeCall<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    method: JString<'local>,
    payload: JString<'local>,
) -> jstring {
    let method: String = env
        .get_string(&method)
        .map(|s| s.into())
        .unwrap_or_default();
    let payload: String = env
        .get_string(&payload)
        .map(|s| s.into())
        .unwrap_or_default();

    let output = std::panic::catch_unwind(|| crate::call(&method, &payload)).unwrap_or_else(|_| {
        "{\"ok\":false,\"error\":\"the recipe engine hit a snag\"}".to_string()
    });

    match env.new_string(output) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}
