use crate::ingredient;
use crate::model::Recipe;
use scraper::{Html, Selector};
use serde_json::Value;
use std::collections::HashSet;

fn sel(pattern: &str) -> Selector {
    Selector::parse(pattern).expect("static selector must parse")
}

fn clean_text<'a>(s: impl IntoIterator<Item = &'a str>) -> String {
    let joined = s.into_iter().collect::<Vec<_>>().join(" ");
    collapse(&joined)
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_html(input: &str) -> String {
    if !input.contains('<') {
        return collapse(input);
    }
    let frag = Html::parse_fragment(input);
    collapse(&frag.root_element().text().collect::<Vec<_>>().join(" "))
}

fn clean_json(input: &str) -> String {
    input
        .replace("<!--", "")
        .replace("-->", "")
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .trim()
        .to_string()
}

fn type_is_recipe(value: &Value) -> bool {
    let matches = |s: &str| {
        s.eq_ignore_ascii_case("recipe") || s.to_lowercase().ends_with("/recipe")
    };
    match value.get("@type") {
        Some(Value::String(s)) => matches(s),
        Some(Value::Array(items)) => items
            .iter()
            .any(|v| v.as_str().map(|s| matches(s)).unwrap_or(false)),
        _ => false,
    }
}

fn find_recipe(value: &Value, depth: usize) -> Option<&Value> {
    if depth > 10 {
        return None;
    }
    match value {
        Value::Array(items) => items.iter().find_map(|v| find_recipe(v, depth + 1)),
        Value::Object(map) => {
            if type_is_recipe(value) {
                return Some(value);
            }
            for key in ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "hasPart"] {
                if let Some(child) = map.get(key) {
                    if let Some(found) = find_recipe(child, depth + 1) {
                        return Some(found);
                    }
                }
            }
            for child in map.values() {
                if let Some(found) = find_recipe(child, depth + 1) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn text_of(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            let t = collapse(s);
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }
        Value::Number(n) => Some(n.to_string()),
        Value::Array(items) => items.iter().find_map(text_of),
        Value::Object(map) => map
            .get("@value")
            .and_then(text_of)
            .or_else(|| map.get("name").and_then(text_of)),
        _ => None,
    }
}

fn string_list(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items.iter().filter_map(text_of).collect(),
        Value::String(s) => s
            .split('\n')
            .map(|x| x.trim().to_string())
            .filter(|x| !x.is_empty())
            .collect(),
        _ => vec![],
    }
}

fn image_of(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Array(items) => items.iter().find_map(image_of),
        Value::Object(map) => map.get("url").and_then(image_of),
        _ => None,
    }
}

fn html_paragraphs(input: &str) -> Vec<String> {
    if !input.contains('<') {
        return input
            .split('\n')
            .map(|s| collapse(s))
            .filter(|s| !s.is_empty())
            .collect();
    }
    let frag = Html::parse_fragment(input);
    let nodes: Vec<String> = frag
        .select(&sel("li, p"))
        .map(|e| clean_text(e.text()))
        .filter(|s| !s.is_empty())
        .collect();
    if nodes.is_empty() {
        let all = clean_text(frag.root_element().text());
        if all.is_empty() {
            vec![]
        } else {
            vec![all]
        }
    } else {
        nodes
    }
}

fn collect_instructions(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(s) => out.extend(html_paragraphs(s)),
        Value::Array(items) => {
            for item in items {
                collect_instructions(item, out);
            }
        }
        Value::Object(map) => {
            if let Some(list) = map.get("itemListElement") {
                collect_instructions(list, out);
            } else if let Some(text) = map.get("text") {
                if let Some(s) = text_of(text) {
                    out.extend(html_paragraphs(&s));
                }
            } else if let Some(steps) = map.get("steps") {
                collect_instructions(steps, out);
            } else if let Some(name) = map.get("name") {
                if let Some(s) = text_of(name) {
                    out.push(s);
                }
            }
        }
        _ => {}
    }
}

fn clean_step(input: &str) -> String {
    let mut s = collapse(input);
    let lower = s.to_lowercase();
    for prefix in ["step ", "step"] {
        if lower.starts_with(prefix) {
            let rest = &s[prefix.len()..];
            let rest = rest.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ':' || c == ')' || c == ' ');
            if rest.len() > 3 {
                s = rest.to_string();
            }
            break;
        }
    }
    let trimmed = s.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ')' || c == '-' || c == ' ');
    if trimmed.len() > 3 {
        trimmed.to_string()
    } else {
        s
    }
}

fn parse_iso_minutes(input: &str) -> Option<i64> {
    let upper = input.trim().to_uppercase();
    if !upper.starts_with('P') {
        return None;
    }
    let (date_part, time_part) = match upper.split_once('T') {
        Some((d, t)) => (d, t),
        None => (upper.as_str(), ""),
    };
    let mut minutes = 0.0f64;
    let mut number = String::new();
    for ch in date_part[1..].chars().chain(time_part.chars()) {
        if ch.is_ascii_digit() || ch == '.' {
            number.push(ch);
            continue;
        }
        let value: f64 = number.parse().unwrap_or(0.0);
        number.clear();
        match ch {
            'D' => minutes += value * 1440.0,
            'H' => minutes += value * 60.0,
            'M' => minutes += value,
            'S' => minutes += value / 60.0,
            _ => {}
        }
    }
    if minutes <= 0.0 {
        None
    } else {
        Some(minutes.round() as i64)
    }
}

fn parse_servings(value: &Value) -> Option<f64> {
    let text = text_of(value)?;
    let digits: String = text
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    let parsed = digits.parse::<f64>().ok()?;
    if parsed >= 1.0 && parsed <= 100.0 {
        Some(parsed)
    } else {
        None
    }
}

fn clean_title(input: &str) -> String {
    let t = collapse(input);
    let first = t.split(" | ").next().unwrap_or(&t).trim().to_string();
    if first.len() >= 6 {
        first
    } else {
        t
    }
}

fn keywords_of(value: &Value) -> Vec<String> {
    let mut out = Vec::new();
    match value {
        Value::Array(_) => out.extend(string_list(value)),
        Value::String(s) => {
            for part in s.split([',', ';']) {
                let p = part.trim();
                if !p.is_empty() {
                    out.push(p.to_string());
                }
            }
        }
        _ => {}
    }
    out
}

fn fill_from_json(recipe: &mut Recipe, node: &Value) {
    if let Some(title) = node.get("name").and_then(text_of) {
        recipe.title = clean_title(&title);
    }
    if let Some(desc) = node.get("description").and_then(text_of) {
        recipe.description = strip_html(&desc);
    }
    if let Some(image) = node.get("image").and_then(image_of) {
        recipe.image = Some(image);
    }
    if let Some(yield_value) = node.get("recipeYield") {
        if let Some(servings) = parse_servings(yield_value) {
            recipe.servings = servings;
        }
    }
    let total = node.get("totalTime").and_then(text_of).and_then(|s| parse_iso_minutes(&s));
    let prep = node.get("prepTime").and_then(text_of).and_then(|s| parse_iso_minutes(&s));
    let cook = node.get("cookTime").and_then(text_of).and_then(|s| parse_iso_minutes(&s));
    recipe.time_min = total.or_else(|| match (prep, cook) {
        (Some(p), Some(c)) => Some(p + c),
        (Some(p), None) => Some(p),
        (None, Some(c)) => Some(c),
        _ => None,
    });
    if let Some(cuisine) = node.get("recipeCuisine").and_then(text_of) {
        recipe.cuisine = Some(cuisine);
    }
    if let Some(author) = node.get("author").and_then(text_of) {
        recipe.author = Some(author);
    }
    if let Some(ing_value) = node.get("recipeIngredient").or_else(|| node.get("ingredients")) {
        let raw = string_list(ing_value);
        recipe.ingredients = ingredient::parse_many(
            &raw.into_iter()
                .filter(|line| !line.ends_with(':') && line.len() > 1)
                .collect::<Vec<_>>(),
        );
    }
    if let Some(instr) = node.get("recipeInstructions") {
        let mut steps = Vec::new();
        collect_instructions(instr, &mut steps);
        recipe.steps = steps
            .into_iter()
            .map(|s| clean_step(&s))
            .filter(|s| s.len() > 2)
            .collect();
    }
    let mut tags: Vec<String> = Vec::new();
    if let Some(kw) = node.get("keywords") {
        tags.extend(keywords_of(kw));
    }
    if let Some(cat) = node.get("recipeCategory") {
        tags.extend(keywords_of(cat));
    }
    let mut seen = HashSet::new();
    recipe.tags = tags
        .into_iter()
        .map(|t| t.to_lowercase())
        .filter(|t| t.len() > 1 && t.len() < 40 && seen.insert(t.clone()))
        .take(6)
        .collect();
}

fn meta(doc: &Html, key: &str) -> Option<String> {
    for pattern in [
        format!("meta[property=\"{key}\"]"),
        format!("meta[name=\"{key}\"]"),
        format!("meta[itemprop=\"{key}\"]"),
    ] {
        if let Ok(s) = Selector::parse(&pattern) {
            if let Some(el) = doc.select(&s).next() {
                if let Some(content) = el.value().attr("content") {
                    let t = collapse(content);
                    if !t.is_empty() {
                        return Some(t);
                    }
                }
            }
        }
    }
    None
}

fn first_text(doc: &Html, pattern: &str) -> Option<String> {
    let selector = Selector::parse(pattern).ok()?;
    let text = doc.select(&selector).next().map(|el| clean_text(el.text()))?;
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn microdata_ingredients(doc: &Html) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(selector) = Selector::parse("[itemprop=recipeIngredient]") {
        out = doc
            .select(&selector)
            .map(|el| clean_text(el.text()))
            .filter(|s| !s.is_empty())
            .collect();
    }
    out
}

fn microdata_steps(doc: &Html) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for pattern in [
        "[itemprop=recipeInstructions] li",
        "[itemprop=recipeInstructions] p",
    ] {
        if let Ok(selector) = Selector::parse(pattern) {
            out = doc
                .select(&selector)
                .map(|el| clean_step(&clean_text(el.text())))
                .filter(|s| s.len() > 2)
                .collect();
            if !out.is_empty() {
                return out;
            }
        }
    }
    if let Some(text) = first_text(doc, "[itemprop=recipeInstructions]") {
        out = text
            .split('\n')
            .map(|s| clean_step(s))
            .filter(|s| s.len() > 2)
            .collect();
    }
    out
}

fn heuristic_ingredients(doc: &Html) -> Vec<String> {
    for pattern in [
        "ul.ingredients li",
        ".ingredients li",
        ".recipe-ingredients li",
        "li[class*=ingredient]",
        "[class*=ingredients] li",
    ] {
        if let Ok(selector) = Selector::parse(pattern) {
            let lines: Vec<String> = doc
                .select(&selector)
                .map(|el| clean_text(el.text()))
                .filter(|s| s.len() > 1 && s.len() < 160 && !s.ends_with(':'))
                .collect();
            if lines.len() >= 3 {
                return lines;
            }
        }
    }
    vec![]
}

fn heuristic_steps(doc: &Html) -> Vec<String> {
    for pattern in [
        ".instructions li",
        ".recipe-instructions li",
        ".method li",
        ".directions li",
        "[class*=instructions] li",
        "[class*=method] li",
        "article ol li",
        "ol li",
    ] {
        if let Ok(selector) = Selector::parse(pattern) {
            let lines: Vec<String> = doc
                .select(&selector)
                .map(|el| clean_step(&clean_text(el.text())))
                .filter(|s| s.len() > 20)
                .collect();
            if lines.len() >= 2 {
                return lines;
            }
        }
    }
    vec![]
}

pub fn extract(html: &str, url: &str) -> Result<Recipe, String> {
    let doc = Html::parse_document(html);
    let mut recipe = Recipe {
        source_url: Some(url.to_string()),
        servings: 4.0,
        ..Default::default()
    };
    let mut used_json_ld = false;

    let mut json_docs: Vec<Value> = Vec::new();
    if let Ok(selector) = Selector::parse("script[type=\"application/ld+json\"]") {
        for element in doc.select(&selector).take(25) {
            let raw: String = element.text().collect::<Vec<_>>().join("");
            if let Ok(value) = serde_json::from_str::<Value>(&clean_json(&raw)) {
                json_docs.push(value);
            }
        }
    }
    if let Some(node) = json_docs.iter().find_map(|v| find_recipe(v, 0)) {
        fill_from_json(&mut recipe, node);
        used_json_ld = true;
    }

    // OpenGraph / page metadata fills gaps.
    if recipe.title.is_empty() {
        if let Some(title) = meta(&doc, "og:title") {
            recipe.title = clean_title(&title);
        }
    }
    if recipe.title.is_empty() {
        if let Some(title) = first_text(&doc, "h1").or_else(|| first_text(&doc, "title")) {
            recipe.title = clean_title(&title);
        }
    }
    if recipe.description.is_empty() {
        if let Some(desc) = meta(&doc, "og:description").or_else(|| meta(&doc, "description")) {
            recipe.description = desc;
        }
    }
    if recipe.image.is_none() {
        recipe.image = meta(&doc, "og:image");
    }

    if recipe.ingredients.is_empty() {
        let raw = microdata_ingredients(&doc);
        if !raw.is_empty() {
            recipe.ingredients = ingredient::parse_many(&raw);
            used_json_ld = false;
        }
    }
    if recipe.steps.is_empty() {
        let raw = microdata_steps(&doc);
        if !raw.is_empty() {
            recipe.steps = raw;
            used_json_ld = false;
        }
    }
    if recipe.ingredients.is_empty() {
        let raw = heuristic_ingredients(&doc);
        if !raw.is_empty() {
            recipe.ingredients = ingredient::parse_many(&raw);
            used_json_ld = false;
        }
    }
    if recipe.steps.is_empty() {
        let raw = heuristic_steps(&doc);
        if !raw.is_empty() {
            recipe.steps = raw;
            used_json_ld = false;
        }
    }
    if recipe.title.is_empty() {
        if let Some(title) = meta(&doc, "og:title") {
            recipe.title = clean_title(&title);
        }
    }

    if recipe.ingredients.is_empty() && recipe.steps.is_empty() {
        return Err(
            "We couldn't find a recipe on that page. Try another link, or add it by hand."
                .to_string(),
        );
    }
    if recipe.title.is_empty() {
        recipe.title = "Untitled recipe".to_string();
    }
    if !used_json_ld {
        recipe
            .warnings
            .push("Read from the page layout — double-check the amounts.".to_string());
    }
    if recipe.ingredients.is_empty() {
        recipe
            .warnings
            .push("We found the steps but not the ingredient list.".to_string());
    }
    if recipe.steps.is_empty() {
        recipe
            .warnings
            .push("We found the ingredients but couldn't read the steps.".to_string());
    }
    if recipe.servings <= 0.0 {
        recipe.servings = 4.0;
    }
    Ok(recipe)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HTML: &str = r#"<!doctype html><html><head>
      <title>Weeknight Lemon Pasta | Example Foods</title>
      <meta property="og:image" content="https://example.com/pasta.jpg" />
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {"@type": "WebPage", "name": "ignored"},
          {"@type": "Recipe",
           "name": "Weeknight Lemon Pasta | Example Foods",
           "description": "Bright, buttery, 20 minutes.",
           "image": ["https://example.com/pasta.jpg"],
           "recipeYield": "4 servings",
           "totalTime": "PT25M",
           "prepTime": "PT10M",
           "cookTime": "PT15M",
           "recipeCuisine": "Italian",
           "keywords": "pasta, quick, vegetarian",
           "recipeIngredient": [
             "200g spaghetti",
             "2 cloves garlic, minced",
             "2 tbsp olive oil (optional)",
             "1 lemon, zested and juiced",
             "50g parmesan, grated",
             "Salt and pepper to taste"
           ],
           "recipeInstructions": [
             {"@type": "HowToStep", "text": "Boil the pasta in well salted water."},
             {"@type": "HowToSection", "name": "Sauce", "itemListElement": [
                {"@type": "HowToStep", "text": "Warm the olive oil and garlic gently."},
                {"@type": "HowToStep", "text": "Toss with lemon, pasta and parmesan."}
             ]}
           ]}
        ]
      }
      </script></head><body></body></html>"#;

    #[test]
    fn reads_json_ld_recipe() {
        let recipe = extract(HTML, "https://example.com/pasta").unwrap();
        assert_eq!(recipe.title, "Weeknight Lemon Pasta");
        assert_eq!(recipe.servings, 4.0);
        assert_eq!(recipe.time_min, Some(25));
        assert_eq!(recipe.cuisine.as_deref(), Some("Italian"));
        assert_eq!(recipe.ingredients.len(), 6);
        assert_eq!(recipe.ingredients[0].canonical_id.as_deref(), Some("pasta"));
        assert_eq!(recipe.steps.len(), 3);
        assert_eq!(recipe.steps[1], "Warm the olive oil and garlic gently.");
        assert!(recipe.tags.iter().any(|t| t == "quick"));
        assert_eq!(recipe.image.as_deref(), Some("https://example.com/pasta.jpg"));
    }

    #[test]
    fn falls_back_to_microdata() {
        let html = r#"<html><body><h1>Tomato Toast</h1>
          <div itemtype="https://schema.org/Recipe">
            <span itemprop="recipeIngredient">2 slices sourdough</span>
            <span itemprop="recipeIngredient">1 tomato</span>
            <div itemprop="recipeInstructions"><p>Toast the bread until golden and crisp.</p><p>Rub with tomato and season well.</p></div>
          </div></body></html>"#;
        let recipe = extract(html, "https://example.com/toast").unwrap();
        assert_eq!(recipe.title, "Tomato Toast");
        assert_eq!(recipe.ingredients.len(), 2);
        assert_eq!(recipe.steps.len(), 2);
        assert!(!recipe.warnings.is_empty());
    }

    #[test]
    fn refuses_pages_without_recipe() {
        let err = extract("<html><body><h1>About us</h1></body></html>", "").unwrap_err();
        assert!(err.contains("couldn't find"));
    }
}
