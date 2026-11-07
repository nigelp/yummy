pub mod catalog;
pub mod extract;
pub mod ingredient;
pub mod matcher;
pub mod model;
pub mod ocr;
pub mod scale;
pub mod units;

#[cfg(target_os = "android")]
mod jni_bridge;

use model::{PantryItem, Recipe};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractRequest {
    html: String,
    #[serde(default)]
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScaleRequest {
    recipe: Recipe,
    #[serde(default)]
    to_servings: Option<f64>,
    #[serde(default = "metric")]
    system: String,
}

fn metric() -> String {
    "metric".to_string()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchRequest {
    recipes: Vec<Recipe>,
    #[serde(default)]
    pantry: Vec<PantryItem>,
    #[serde(default)]
    use_staples: Option<bool>,
    #[serde(default)]
    substitutions: Option<bool>,
}

#[derive(Deserialize)]
struct IngredientRequest {
    line: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IngredientsRequest {
    lines: Vec<String>,
}

#[derive(Deserialize)]
struct OcrRequest {
    text: String,
}

fn dispatch(method: &str, payload: &str) -> Result<Value, String> {
    match method {
        "health" => Ok(json!({
            "version": env!("CARGO_PKG_VERSION"),
            "catalogSize": catalog::items().len(),
            "engine": "rust"
        })),
        "catalog" => Ok(json!({
            "aisles": catalog::aisles(),
            "items": catalog::items()
        })),
        "parse_ingredient" => {
            let req: IngredientRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            serde_json::to_value(ingredient::parse(&req.line)).map_err(|e| e.to_string())
        }
        "parse_ingredients" => {
            let req: IngredientsRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            serde_json::to_value(ingredient::parse_many(&req.lines)).map_err(|e| e.to_string())
        }
        "scale_recipe" => {
            let req: ScaleRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            let to = req.to_servings.unwrap_or(req.recipe.servings);
            let system = if req.system == "imperial" {
                "imperial"
            } else {
                "metric"
            };
            serde_json::to_value(scale::scale(&req.recipe, to, system))
                .map_err(|e| e.to_string())
        }
        "match_recipes" => {
            let req: MatchRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            let results = matcher::match_all(
                &req.recipes,
                &req.pantry,
                req.use_staples.unwrap_or(true),
                req.substitutions.unwrap_or(true),
            );
            serde_json::to_value(results).map_err(|e| e.to_string())
        }
        "match_recipe" => {
            let req: MatchRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            let recipe = req
                .recipes
                .first()
                .ok_or_else(|| "no recipe supplied".to_string())?;
            let result = matcher::match_recipe(
                recipe,
                &req.pantry,
                req.use_staples.unwrap_or(true),
                req.substitutions.unwrap_or(true),
            );
            serde_json::to_value(result).map_err(|e| e.to_string())
        }
        "extract_recipe" => {
            let req: ExtractRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            let recipe = extract::extract(&req.html, &req.url)?;
            serde_json::to_value(recipe).map_err(|e| e.to_string())
        }
        "parse_ocr" => {
            let req: OcrRequest =
                serde_json::from_str(payload).map_err(|e| format!("bad payload: {e}"))?;
            serde_json::to_value(ocr::parse_recipe_text(&req.text)).map_err(|e| e.to_string())
        }
        other => Err(format!("unknown method: {other}")),
    }
}

/// The one entrypoint both the JNI bridge and tests use.
pub fn call(method: &str, payload: &str) -> String {
    match dispatch(method, payload) {
        Ok(data) => json!({ "ok": true, "data": data }).to_string(),
        Err(error) => json!({ "ok": false, "error": error }).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_methods_are_reported() {
        let parsed: Value = serde_json::from_str(&call("nope", "{}")).unwrap();
        assert_eq!(parsed["ok"], false);
    }

    #[test]
    fn catalog_is_available() {
        let parsed: Value = serde_json::from_str(&call("catalog", "{}")).unwrap();
        assert_eq!(parsed["ok"], true);
        assert!(parsed["data"]["items"].as_array().unwrap().len() > 80);
    }

    #[test]
    fn scale_round_trip() {
        let recipe = json!({
            "id": "x",
            "title": "Soup",
            "servings": 4,
            "ingredients": [{"raw": "500 g potatoes", "item": "potatoes", "qty": 500.0, "unit": "g", "canonicalId": "potato"}]
        });
        let payload = json!({ "recipe": recipe, "toServings": 6, "system": "metric" }).to_string();
        let parsed: Value = serde_json::from_str(&call("scale_recipe", &payload)).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["data"]["servings"], 6.0);
        assert!(parsed["data"]["ingredients"][0]["text"].as_str().unwrap().contains("750"));
    }
}
