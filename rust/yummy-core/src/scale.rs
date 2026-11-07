use crate::catalog;
use crate::model::*;
use crate::units;

pub fn scale(recipe: &Recipe, to_servings: f64, system: &str) -> ScaleResult {
    let from = if recipe.servings > 0.0 {
        recipe.servings
    } else {
        4.0
    };
    let target = if to_servings > 0.0 { to_servings } else { from };
    let factor = target / from;

    let mut ingredients = Vec::with_capacity(recipe.ingredients.len());
    let mut notes: Vec<String> = Vec::new();

    for ing in &recipe.ingredients {
        let cup_g = catalog::cup_grams(ing.canonical_id.as_deref());
        let mut qty = ing.qty.map(|q| q * factor);
        let mut note = ing.note.clone();

        if let (Some(q), Some(id)) = (qty, ing.canonical_id.as_deref()) {
            if id == "egg" || id == "lemon" || id == "lime" || id == "onion" {
                let rounded = q.round();
                if rounded >= 1.0 && (q - rounded).abs() > 0.02 {
                    note = Some(match note {
                        Some(existing) => format!("{} — round up to {} for ease", existing, rounded as i64),
                        None => format!("≈ round to {} for ease", rounded as i64),
                    });
                    qty = Some(rounded);
                }
            }
        }

        let text = units::scaled_text(
            qty,
            ing.unit.as_deref(),
            &ing.item,
            system,
            cup_g,
            note.as_deref(),
        );

        let (amount, display_unit) = match qty {
            Some(q) => {
                let (a, u, _) = units::display_amount(q, ing.unit.as_deref(), system, cup_g);
                (Some(a), Some(u))
            }
            None => (None, None),
        };

        ingredients.push(ScaledIngredient {
            text,
            item: ing.item.clone(),
            amount,
            unit: display_unit,
            canonical_id: ing.canonical_id.clone(),
            optional: ing.optional,
            note,
        });
    }

    if (factor - 1.0).abs() > 0.01 {
        notes.push(
            "Salt, chili and strong spices don't scale perfectly — season, taste, then adjust."
                .to_string(),
        );
    }
    if factor >= 1.75 {
        notes.push(
            "Cooking a big batch? Use a wider pan or two trays, and start checking 5–10 minutes early."
                .to_string(),
        );
    } else if factor <= 0.6 {
        notes.push(
            "Small batch: use a smaller pan so things brown instead of steam.".to_string(),
        );
    }
    if recipe.ingredients.iter().any(|i| {
        i.canonical_id.as_deref() == Some("baking_powder")
            || i.canonical_id.as_deref() == Some("baking_soda")
            || i.canonical_id.as_deref() == Some("yeast")
    }) && (factor - 1.0).abs() > 0.01
    {
        notes.push("For baking, scale by weight where you can — leavening is fussy.".to_string());
    }

    ScaleResult {
        servings: target,
        factor,
        ingredients,
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingredient;

    fn recipe() -> Recipe {
        Recipe {
            title: "Pancakes".into(),
            servings: 4.0,
            ingredients: vec![
                ingredient::parse("200 g flour"),
                ingredient::parse("2 large eggs"),
                ingredient::parse("300 ml milk"),
                ingredient::parse("1 tsp baking powder"),
                ingredient::parse("Pinch of salt"),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn doubles_metric_amounts() {
        let result = scale(&recipe(), 8.0, "metric");
        assert_eq!(result.factor, 2.0);
        assert!(result.ingredients[0].text.starts_with("400 g"));
        assert!(result.ingredients[2].text.starts_with("600 ml"));
    }

    #[test]
    fn rounds_eggs_for_humans() {
        let result = scale(&recipe(), 6.0, "metric");
        // 2 eggs * 1.5 = 3 eggs, no rounding note needed
        assert!(result.ingredients[1].text.starts_with("3 "));
        assert!(result.ingredients[1].note.is_none());

        let result = scale(&recipe(), 5.0, "metric");
        // 2.5 eggs -> 3 with a note
        assert!(result.ingredients[1].text.contains("3 "));
        assert!(result.ingredients[1].note.is_some());
    }

    #[test]
    fn imperial_mode_uses_cups() {
        let result = scale(&recipe(), 4.0, "imperial");
        assert!(result.ingredients[2].text.contains("cup"));
    }

    #[test]
    fn untouched_ingredients_stay_readable() {
        let result = scale(&recipe(), 4.0, "metric");
        assert!(result.ingredients[4].text.contains("Pinch of salt"));
    }
}
