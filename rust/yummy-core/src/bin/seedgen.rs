use serde_json::{json, Value};
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let input = args.get(1).cloned().unwrap_or_else(|| "../../src/data/seed-source.json".into());
    let output = args.get(2).cloned().unwrap_or_else(|| "../../src/data/seed.json".into());

    let raw = fs::read_to_string(&input).expect("read seed source");
    let root: Value = serde_json::from_str(&raw).expect("parse seed source");
    let recipes = root["recipes"].as_array().expect("recipes array");

    let mut out = Vec::new();
    for entry in recipes {
        let mut recipe = entry.clone();
        let lines: Vec<String> = recipe["ingredients"]
            .as_array()
            .map(|values| {
                values
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let parsed = yummy_core::ingredient::parse_many(&lines);
        recipe["ingredients"] = serde_json::to_value(parsed).expect("serialize ingredients");
        recipe["source"] = json!("seed");
        recipe["favorite"] = json!(false);
        recipe["cookCount"] = json!(0);
        recipe["notes"] = json!([]);
        recipe["warnings"] = json!([]);
        recipe["createdAt"] = json!("2026-10-01T09:00:00.000Z");
        out.push(recipe);
    }

    let pretty = serde_json::to_string_pretty(&json!({ "recipes": out })).expect("serialize output");
    fs::write(&output, pretty + "\n").expect("write seed output");
    println!("wrote {} recipes to {}", out.len(), output);
}
