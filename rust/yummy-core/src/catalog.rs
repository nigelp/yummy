use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Aisle {
    pub id: String,
    pub label: String,
    pub emoji: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub aisle: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cup_grams: Option<f64>,
    #[serde(default)]
    pub staple: bool,
}

#[derive(Deserialize)]
struct CatalogFile {
    aisles: Vec<Aisle>,
    items: Vec<CatalogItem>,
}

static CATALOG: OnceLock<CatalogFile> = OnceLock::new();

fn data() -> &'static CatalogFile {
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../assets/catalog.json"))
            .expect("bundled catalog.json must be valid")
    })
}

pub fn aisles() -> &'static [Aisle] {
    &data().aisles
}

pub fn items() -> &'static [CatalogItem] {
    &data().items
}

pub fn item(id: &str) -> Option<&'static CatalogItem> {
    data().items.iter().find(|i| i.id == id)
}

/// Liquids are measured by volume in metric kitchens, so their cup weight
/// should not be used to turn millilitres into grams.
const LIQUIDS: &[&str] = &[
    "milk",
    "cream",
    "buttermilk",
    "yogurt",
    "sour_cream",
    "water",
    "stock",
    "wine",
    "olive_oil",
    "oil",
    "vinegar",
    "soy_sauce",
    "honey",
    "maple_syrup",
    "coconut_milk",
    "lemon_juice",
    "ketchup",
];

pub fn is_liquid(id: &str) -> bool {
    LIQUIDS.contains(&id)
}

pub fn cup_grams(id: Option<&str>) -> Option<f64> {
    let id = id?;
    if is_liquid(id) {
        return None;
    }
    item(id).and_then(|i| i.cup_grams)
}

/// Pantry items that should satisfy each other for matching purposes.
pub fn family(id: &str) -> &'static [&'static str] {
    match id {
        "chicken" | "chicken_breast" | "chicken_thigh" => {
            &["chicken", "chicken_breast", "chicken_thigh"]
        }
        _ => &[],
    }
}

pub fn aisle_of(id: Option<&str>) -> String {
    id.and_then(item)
        .map(|i| i.aisle.clone())
        .unwrap_or_else(|| "other".to_string())
}

const STOPWORDS: &[&str] = &[
    "fresh",
    "large",
    "medium",
    "small",
    "ripe",
    "whole",
    "boneless",
    "skinless",
    "organic",
    "free",
    "range",
    "extra",
    "virgin",
    "of",
    "a",
    "an",
    "the",
    "to",
    "taste",
    "optional",
    "plus",
    "for",
    "serving",
    "garnish",
];

fn normalize_words(text: &str) -> Vec<String> {
    let lowered = text.to_lowercase().replace(['’', '\''], "");
    let cleaned: String = lowered
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    cleaned
        .split_whitespace()
        .map(|w| singularize(w))
        .filter(|w| !w.is_empty() && !STOPWORDS.contains(&w.as_str()))
        .collect()
}

fn singularize(word: &str) -> String {
    if word.len() <= 3 {
        return word.to_string();
    }
    if let Some(stem) = word.strip_suffix("ies") {
        if stem.len() >= 2 {
            return format!("{}y", stem);
        }
    }
    if let Some(stem) = word.strip_suffix("oes") {
        if stem.len() >= 2 {
            return stem.to_string();
        }
    }
    if word.ends_with("ses") || word.ends_with("xes") || word.ends_with("ches") || word.ends_with("shes") {
        return word[..word.len() - 2].to_string();
    }
    if word.ends_with('s') && !word.ends_with("ss") {
        return word[..word.len() - 1].to_string();
    }
    word.to_string()
}

/// Normalised lookup key for free-text names (used for custom pantry items).
pub fn key(text: &str) -> String {
    normalize_words(text).join(" ")
}

fn contains_phrase(haystack: &[String], needle: &[String]) -> bool {
    if needle.is_empty() || needle.len() > haystack.len() {
        return false;
    }
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

/// Map a free-text ingredient name onto a catalog item.
pub fn canonicalize(text: &str) -> Option<&'static CatalogItem> {
    let words = normalize_words(text);
    if words.is_empty() {
        return None;
    }
    let joined = words.join(" ");

    // Exact alias first.
    for item in items() {
        for alias in std::iter::once(&item.name).chain(item.aliases.iter()) {
            if normalize_words(alias).join(" ") == joined {
                return Some(item);
            }
        }
    }

    // Then the longest alias phrase contained in the text.
    let mut best: Option<(&CatalogItem, usize, usize)> = None;
    for item in items() {
        for alias in std::iter::once(&item.name).chain(item.aliases.iter()) {
            let alias_words = normalize_words(alias);
            if alias_words.is_empty() {
                continue;
            }
            if contains_phrase(&words, &alias_words) {
                let score = (alias_words.len(), alias_words.iter().map(|w| w.len()).sum());
                if best.map(|(_, b_len, b_chars)| score > (b_len, b_chars)).unwrap_or(true) {
                    best = Some((item, score.0, score.1));
                }
            }
        }
    }

    best.map(|(item, _, _)| item)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id_of(text: &str) -> Option<&'static str> {
        canonicalize(text).map(|i| i.id.as_str())
    }

    #[test]
    fn plain_names() {
        assert_eq!(id_of("eggs"), Some("egg"));
        assert_eq!(id_of("3 large eggs"), Some("egg"));
        assert_eq!(id_of("cherry tomatoes"), Some("tomato"));
        assert_eq!(id_of("all-purpose flour"), Some("flour"));
    }

    #[test]
    fn preserves_compounds() {
        assert_eq!(id_of("coconut milk"), Some("coconut_milk"));
        assert_eq!(id_of("canned chopped tomatoes"), Some("canned_tomatoes"));
        assert_eq!(id_of("chicken stock"), Some("stock"));
        assert_eq!(id_of("red onion"), Some("red_onion"));
        assert_eq!(id_of("olive oil"), Some("olive_oil"));
        assert_eq!(id_of("tomato paste"), Some("tomato_paste"));
    }

    #[test]
    fn messy_lines() {
        assert_eq!(id_of("boneless skinless chicken breasts"), Some("chicken_breast"));
        assert_eq!(id_of("ground beef mince"), Some("beef"));
        assert_eq!(id_of("freshly chopped parsley"), Some("parsley"));
    }
}
