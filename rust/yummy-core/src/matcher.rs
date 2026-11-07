use crate::catalog;
use crate::model::*;
use crate::units;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Deserialize, Clone, Debug)]
struct SubDef {
    missing: String,
    #[serde(rename = "use")]
    use_ids: Vec<String>,
    note: String,
}

static SUBSTITUTIONS: OnceLock<Vec<SubDef>> = OnceLock::new();

fn substitutions() -> &'static [SubDef] {
    SUBSTITUTIONS.get_or_init(|| {
        serde_json::from_str(include_str!("../assets/substitutions.json"))
            .expect("bundled substitutions.json must be valid")
    })
}

fn name_of(id: &str) -> String {
    catalog::item(id)
        .map(|i| i.name.to_lowercase())
        .unwrap_or_else(|| id.replace('_', " "))
}

fn find_sub(
    missing_id: &str,
    pantry_ids: &HashMap<String, &PantryItem>,
) -> Option<SubSuggestion> {
    for def in substitutions().iter().filter(|d| d.missing == missing_id) {
        if def.use_ids.iter().all(|id| pantry_ids.contains_key(id)) {
            let names: Vec<String> = def.use_ids.iter().map(|id| name_of(id)).collect();
            return Some(SubSuggestion {
                text: format!("{} — {}", names.join(" + "), def.note),
                ids: def.use_ids.clone(),
                names,
            });
        }
    }
    None
}

fn qty_text_for(ing: &Ingredient) -> Option<String> {
    units::amount_text(
        ing.qty,
        ing.unit.as_deref(),
        "metric",
        catalog::cup_grams(ing.canonical_id.as_deref()),
    )
}


/// Catalog ids are the fast path; if a user invented their own pantry item,
/// fall back to comparing the ingredient name with their item name.
fn pantry_for<'a>(
    ing: &Ingredient,
    canonical_id: Option<&str>,
    pantry: &'a [PantryItem],
    pantry_ids: &HashMap<String, &'a PantryItem>,
) -> Option<&'a PantryItem> {
    if let Some(id) = canonical_id {
        if let Some(item) = pantry_ids.get(id) {
            return Some(*item);
        }
        for alternative in catalog::family(id) {
            if let Some(item) = pantry_ids.get(*alternative) {
                return Some(*item);
            }
        }
    }
    let needle = catalog::key(&ing.item);
    if needle.is_empty() {
        return None;
    }
    pantry.iter().find(|entry| {
        if !entry.name.is_empty() && catalog::key(&entry.name) == needle {
            return true;
        }
        catalog::item(&entry.id)
            .map(|item| catalog::key(&item.name) == needle)
            .unwrap_or(false)
    })
}

pub fn match_recipe(
    recipe: &Recipe,
    pantry: &[PantryItem],
    use_staples: bool,
    allow_substitutions: bool,
) -> MatchResult {
    let pantry_ids: HashMap<String, &PantryItem> =
        pantry.iter().map(|p| (p.id.clone(), p)).collect();

    let mut total = 0i32;
    let mut have = 0i32;
    let mut core_total = 0i32;
    let mut core_have = 0i32;
    let mut missing: Vec<MissingItem> = Vec::new();
    let mut short: Vec<MissingItem> = Vec::new();
    let mut details: Vec<PantryStatus> = Vec::new();
    let mut expiring: Vec<String> = Vec::new();

    for ing in &recipe.ingredients {
        let canonical_id = ing
            .canonical_id
            .clone()
            .or_else(|| catalog::canonicalize(&ing.item).map(|i| i.id.clone()));
        let item_def = canonical_id.as_deref().and_then(catalog::item);
        let display = if !ing.item.trim().is_empty() {
            ing.item.trim().to_string()
        } else {
            item_def
                .map(|i| i.name.clone())
                .unwrap_or_else(|| "something".to_string())
        };
        let aisle = canonical_id
            .as_deref()
            .map(|id| catalog::aisle_of(Some(id)))
            .unwrap_or_else(|| "other".to_string());
        let is_staple = use_staples && item_def.map(|i| i.staple).unwrap_or(false);
        let pantry_item = pantry_for(ing, canonical_id.as_deref(), pantry, &pantry_ids);

        if ing.optional {
            details.push(PantryStatus {
                canonical_id,
                item: display,
                state: if pantry_item.is_some() { "have" } else { "optional" }.to_string(),
                note: Some("optional".into()),
            });
            continue;
        }

        total += 1;
        if !is_staple {
            core_total += 1;
        }

        if is_staple {
            have += 1;
            details.push(PantryStatus {
                canonical_id,
                item: display,
                state: "staple".to_string(),
                note: None,
            });
            continue;
        }

        if let Some(p) = pantry_item {
            have += 1;
            if !is_staple {
                core_have += 1;
            }
            if let Some(days) = p.days_left {
                if days <= 3 {
                    let friendly = if days <= 0 {
                        "use today".to_string()
                    } else {
                        format!("{} day{} left", days, if days == 1 { "" } else { "s" })
                    };
                    expiring.push(format!("{} ({})", display, friendly));
                }
            }
            let mut note = None;
            let mut state = "have";
            if let (Some(have_qty), Some(need_qty), Some(unit)) =
                (p.qty, ing.qty, ing.unit.as_deref())
            {
                let have_unit = p.unit.as_deref().unwrap_or(unit);
                if let (Some(hdef), Some(pdef)) = (units::lookup(unit), units::lookup(have_unit)) {
                    if hdef.kind == pdef.kind {
                        let need_base = need_qty * hdef.base;
                        let have_base = have_qty * pdef.base;
                        if have_base + 1e-6 < need_base * 0.75 {
                            state = "short";
                            note = Some("You may be short — check the carton".into());
                            short.push(MissingItem {
                                item: display.clone(),
                                aisle: aisle.clone(),
                                qty_text: qty_text_for(ing),
                                canonical_id: canonical_id.clone(),
                                sub: None,
                            });
                        }
                    }
                }
            }
            details.push(PantryStatus {
                canonical_id,
                item: display,
                state: state.to_string(),
                note,
            });
            continue;
        }

        let sub = if allow_substitutions {
            canonical_id
                .as_deref()
                .and_then(|id| find_sub(id, &pantry_ids))
        } else {
            None
        };

        missing.push(MissingItem {
            item: display.clone(),
            aisle: aisle.clone(),
            qty_text: qty_text_for(ing),
            canonical_id: canonical_id.clone(),
            sub: sub.clone(),
        });
        details.push(PantryStatus {
            canonical_id,
            item: display,
            state: "missing".to_string(),
            note: sub.map(|s| s.text),
        });
    }

    let score = if total == 0 {
        100
    } else {
        ((have as f64 / total as f64) * 100.0).round() as i32
    };
    let substitutable = !missing.is_empty() && missing.iter().all(|m| m.sub.is_some());

    MatchResult {
        recipe_id: recipe.id.clone(),
        score,
        have,
        total,
        core_have,
        core_total,
        missing,
        short,
        expiring_used: expiring,
        details,
        substitutable,
    }
}

pub fn match_all(
    recipes: &[Recipe],
    pantry: &[PantryItem],
    use_staples: bool,
    allow_substitutions: bool,
) -> Vec<MatchResult> {
    let mut results: Vec<MatchResult> = recipes
        .iter()
        .map(|r| match_recipe(r, pantry, use_staples, allow_substitutions))
        .collect();
    results.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then(a.missing.len().cmp(&b.missing.len()))
            .then(b.expiring_used.len().cmp(&a.expiring_used.len()))
    });
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ing(line: &str) -> Ingredient {
        crate::ingredient::parse(line)
    }

    fn recipe() -> Recipe {
        Recipe {
            id: "r1".into(),
            title: "Test pasta".into(),
            servings: 2.0,
            ingredients: vec![
                ing("200g spaghetti"),
                ing("2 cloves garlic"),
                ing("2 tbsp olive oil"),
                ing("50g parmesan"),
                ing("1 lemon"),
                ing("Salt and pepper to taste"),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn perfect_pantry_scores_full() {
        let pantry = vec![
            PantryItem { id: "pasta".into(), ..Default::default() },
            PantryItem { id: "garlic".into(), ..Default::default() },
            PantryItem { id: "olive_oil".into(), ..Default::default() },
            PantryItem { id: "parmesan".into(), ..Default::default() },
            PantryItem { id: "lemon".into(), ..Default::default() },
        ];
        let m = match_recipe(&recipe(), &pantry, true, true);
        assert_eq!(m.score, 100);
        assert!(m.missing.is_empty());
    }

    #[test]
    fn missing_items_are_listed_with_aisle() {
        let pantry = vec![PantryItem { id: "pasta".into(), ..Default::default() }];
        let m = match_recipe(&recipe(), &pantry, false, true);
        assert!(m.score < 60);
        assert!(m.missing.iter().any(|i| i.canonical_id.as_deref() == Some("garlic")));
        assert!(m.missing.iter().any(|i| i.aisle == "produce"));
    }

    #[test]
    fn substitutes_only_when_all_parts_present() {
        let pantry = vec![PantryItem { id: "milk".into(), ..Default::default() }];
        let r = Recipe {
            id: "r2".into(),
            servings: 2.0,
            ingredients: vec![ing("1 cup buttermilk")],
            ..Default::default()
        };
        let m = match_recipe(&r, &pantry, false, true);
        assert!(m.missing[0].sub.is_none());

        let pantry = vec![
            PantryItem { id: "milk".into(), ..Default::default() },
            PantryItem { id: "lemon_juice".into(), ..Default::default() },
        ];
        let m = match_recipe(&r, &pantry, false, true);
        assert!(m.missing[0].sub.is_some());
        assert!(m.substitutable);
    }

    #[test]
    fn chicken_family_matches_across_cuts() {
        let r = Recipe {
            id: "roast".into(),
            servings: 4.0,
            ingredients: vec![ing("1 whole chicken"), ing("2 tbsp olive oil")],
            ..Default::default()
        };
        let pantry = vec![PantryItem {
            id: "chicken_breast".into(),
            ..Default::default()
        }];
        let m = match_recipe(&r, &pantry, true, true);
        assert_eq!(m.core_have, 1);
        assert_eq!(m.missing.len(), 0);
    }

    #[test]
    fn staples_alone_do_not_make_a_match() {
        let r = Recipe {
            id: "dessert".into(),
            servings: 2.0,
            ingredients: vec![ing("200 g flour"), ing("100 g sugar"), ing("1 pinch of salt")],
            ..Default::default()
        };
        let m = match_recipe(&r, &[], true, true);
        assert_eq!(m.score, 100);
        assert_eq!(m.core_total, 0);
        assert_eq!(m.core_have, 0);

        let r = Recipe {
            id: "eggs".into(),
            servings: 2.0,
            ingredients: vec![ing("200 g flour"), ing("2 eggs")],
            ..Default::default()
        };
        let pantry = vec![PantryItem { id: "egg".into(), ..Default::default() }];
        let m = match_recipe(&r, &pantry, true, true);
        assert_eq!(m.core_total, 1);
        assert_eq!(m.core_have, 1);
    }

    #[test]
    fn custom_pantry_items_match_by_name() {
        let r = Recipe {
            id: "r3".into(),
            servings: 2.0,
            ingredients: vec![ing("2 tbsp gochujang"), ing("1 tsp sesame seeds")],
            ..Default::default()
        };
        let pantry = vec![PantryItem {
            id: "custom-gochujang".into(),
            name: "Gochujang".into(),
            ..Default::default()
        }];
        let m = match_recipe(&r, &pantry, false, true);
        assert_eq!(m.score, 50);
        assert!(m.missing.iter().any(|i| i.item == "sesame seeds"));
        assert!(!m.missing.iter().any(|i| i.item == "gochujang"));

        let pantry = vec![PantryItem {
            id: "custom-gochujang".into(),
            name: "Miso paste".into(),
            ..Default::default()
        }];
        let m = match_recipe(&r, &pantry, false, true);
        assert!(m.missing.iter().any(|i| i.item == "gochujang"));
    }

    #[test]
    fn expiring_food_is_flagged() {
        let pantry = vec![PantryItem {
            id: "lemon".into(),
            days_left: Some(2),
            ..Default::default()
        }];
        let m = match_recipe(&recipe(), &pantry, false, false);
        assert!(m.expiring_used.iter().any(|e| e.to_lowercase().starts_with("lemon")));
    }
}
