use crate::ingredient;
use crate::model::Recipe;

fn clean_line(line: &str) -> String {
    let stripped = line
        .trim()
        .trim_start_matches(|c: char| matches!(c, '•' | '*' | '-' | '·' | '□' | '☐'));
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_heading(line: &str) -> bool {
    let l = line.to_lowercase();
    let l = l.trim_end_matches(':');
    l == "ingredients"
        || l.starts_with("ingredients ")
        || l == "you will need"
        || l == "what you need"
        || l == "instructions"
        || l == "method"
        || l == "directions"
        || l == "steps"
        || l == "preparation"
        || l.starts_with("instructions ")
        || l.starts_with("method ")
        || l.starts_with("directions ")
}

fn ingredients_heading(line: &str) -> bool {
    let l = line.to_lowercase();
    l.contains("ingredient") || l == "you will need" || l == "what you need"
}

fn steps_heading(line: &str) -> bool {
    let l = line.to_lowercase();
    l.contains("instruction")
        || l.contains("method")
        || l.contains("direction")
        || l == "steps"
        || l.contains("preparation")
}

fn find_number_after(text: &str, needles: &[&str]) -> Option<f64> {
    let lower = text.to_lowercase();
    for needle in needles {
        if let Some(pos) = lower.find(needle) {
            let tail = &text[pos + needle.len()..];
            let digits: String = tail
                .chars()
                .skip_while(|c| !c.is_ascii_digit())
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if let Ok(v) = digits.parse::<f64>() {
                if v > 0.0 {
                    return Some(v);
                }
            }
        }
    }
    None
}

fn looks_like_ingredient(line: &str) -> bool {
    let first = line.chars().next().unwrap_or(' ');
    if first.is_ascii_digit() {
        return true;
    }
    let lower = line.to_lowercase();
    [
        "pinch", "handful", "bunch", "splash", "tbsp", "tsp", "cup", "grams", "g ", "kg",
        "ml", "clove",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

pub fn parse_recipe_text(text: &str) -> Recipe {
    let lines: Vec<String> = text
        .lines()
        .map(clean_line)
        .filter(|l| !l.is_empty())
        .collect();

    let mut recipe = Recipe {
        servings: 4.0,
        warnings: vec![
            "Read from a photo — check the amounts and cooking times before you start.".to_string(),
        ],
        ..Default::default()
    };
    if lines.is_empty() {
        return recipe;
    }

    let ing_idx = lines.iter().position(|l| ingredients_heading(l));
    let step_idx = lines
        .iter()
        .position(|l| steps_heading(l) && !ingredients_heading(l));

    // Title: first meaty line that isn't a heading.
    recipe.title = lines
        .iter()
        .find(|l| !is_heading(l) && l.len() >= 3 && l.len() <= 90)
        .cloned()
        .unwrap_or_else(|| "My recipe".to_string());

    let ing_start = ing_idx.map(|i| i + 1).unwrap_or(0);
    let ing_end = match (ing_idx, step_idx) {
        (Some(i), Some(s)) if s > i => s,
        (Some(_), _) => lines.len(),
        (None, Some(s)) => s,
        (None, None) => lines.len(),
    };

    let mut ingredient_lines: Vec<String> = Vec::new();
    if ing_idx.is_some() {
        for line in &lines[ing_start..ing_end] {
            if is_heading(line) {
                continue;
            }
            if line.len() > 2 && line.len() < 160 {
                ingredient_lines.push(line.clone());
            }
        }
    }
    if ingredient_lines.is_empty() {
        ingredient_lines = lines
            .iter()
            .filter(|l| looks_like_ingredient(l) && l.len() < 160 && !is_heading(l))
            .cloned()
            .collect();
    }
    recipe.ingredients = ingredient::parse_many(&ingredient_lines);

    if let Some(s) = step_idx {
        let mut steps: Vec<String> = Vec::new();
        for line in &lines[s + 1..] {
            if is_heading(line) {
                continue;
            }
            if line.len() < 15 {
                continue;
            }
            // A line that starts lowercase is usually a wrapped continuation.
            let starts_lower = line.chars().next().map(|c| c.is_lowercase()).unwrap_or(false);
            if starts_lower {
                if let Some(last) = steps.last_mut() {
                    last.push(' ');
                    last.push_str(line);
                    continue;
                }
            }
            steps.push(line.clone());
        }
        recipe.steps = steps;
    }

    let joined = lines.join(" ");
    if let Some(servings) = find_number_after(&joined, &["serves", "servings", "serving", "makes"]) {
        if servings >= 1.0 && servings <= 30.0 {
            recipe.servings = servings;
        }
    }
    if let Some(hours) = find_number_after(&joined, &["hour", "hours", "hr"]) {
        recipe.time_min = Some((hours * 60.0) as i64);
    } else if let Some(mins) = find_number_after(&joined, &["minutes", "minute", "mins", "min"]) {
        recipe.time_min = Some(mins as i64);
    }

    if recipe.ingredients.is_empty() {
        recipe
            .warnings
            .push("No ingredients were read — type them in to get pantry matching.".to_string());
    }
    if recipe.steps.is_empty() {
        recipe
            .warnings
            .push("No steps were read — add them in your own words.".to_string());
    }
    recipe
}

#[cfg(test)]
mod tests {
    use super::*;

    const OCR: &str = "Nonna's Tomato Pasta\nServes 4\nIngredients\n• 400 g spaghetti\n• 2 tbsp olive oil\n• 3 cloves garlic, sliced\n• 1 (400 g) can chopped tomatoes\n• A handful of basil\n• Salt and pepper\nMethod\n1. Boil the pasta in salted water until just tender.\n2. Gently fry the garlic in the oil until fragrant.\n3. Add the tomatoes and simmer for 15 minutes, then toss with the pasta and basil.\n";

    #[test]
    fn reads_headings_and_bullets() {
        let recipe = parse_recipe_text(OCR);
        assert_eq!(recipe.title, "Nonna's Tomato Pasta");
        assert_eq!(recipe.servings, 4.0);
        assert_eq!(recipe.ingredients.len(), 6);
        assert_eq!(recipe.steps.len(), 3);
        assert_eq!(recipe.ingredients[2].canonical_id.as_deref(), Some("garlic"));
    }

    #[test]
    fn empty_photo_is_graceful() {
        let recipe = parse_recipe_text("");
        assert!(recipe.ingredients.is_empty());
        assert!(recipe.title.is_empty());
    }
}
