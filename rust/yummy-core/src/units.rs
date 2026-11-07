use crate::model::Ingredient;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Mass,
    Volume,
    Count,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Mass => "mass",
            Kind::Volume => "volume",
            Kind::Count => "count",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Unit {
    pub canonical: &'static str,
    pub kind: Kind,
    /// grams for mass, millilitres for volume, 1 for count
    pub base: f64,
}

const UNITS: &[(&str, Kind, f64, &str)] = &[
    // volume
    ("cup", Kind::Volume, 240.0, "cup"),
    ("cups", Kind::Volume, 240.0, "cup"),
    ("tbsp", Kind::Volume, 15.0, "tbsp"),
    ("tablespoon", Kind::Volume, 15.0, "tbsp"),
    ("tablespoons", Kind::Volume, 15.0, "tbsp"),
    ("tbs", Kind::Volume, 15.0, "tbsp"),
    ("tsp", Kind::Volume, 5.0, "tsp"),
    ("teaspoon", Kind::Volume, 5.0, "tsp"),
    ("teaspoons", Kind::Volume, 5.0, "tsp"),
    ("ml", Kind::Volume, 1.0, "ml"),
    ("milliliter", Kind::Volume, 1.0, "ml"),
    ("milliliters", Kind::Volume, 1.0, "ml"),
    ("millilitre", Kind::Volume, 1.0, "ml"),
    ("millilitres", Kind::Volume, 1.0, "ml"),
    ("l", Kind::Volume, 1000.0, "l"),
    ("liter", Kind::Volume, 1000.0, "l"),
    ("liters", Kind::Volume, 1000.0, "l"),
    ("litre", Kind::Volume, 1000.0, "l"),
    ("litres", Kind::Volume, 1000.0, "l"),
    ("pint", Kind::Volume, 473.176, "pint"),
    ("pints", Kind::Volume, 473.176, "pint"),
    ("quart", Kind::Volume, 946.353, "quart"),
    ("quarts", Kind::Volume, 946.353, "quart"),
    ("gallon", Kind::Volume, 3785.41, "gallon"),
    ("gallons", Kind::Volume, 3785.41, "gallon"),
    ("fl oz", Kind::Volume, 29.5735, "fl oz"),
    ("fluid ounce", Kind::Volume, 29.5735, "fl oz"),
    ("fluid ounces", Kind::Volume, 29.5735, "fl oz"),
    ("dash", Kind::Volume, 0.6, "dash"),
    ("dashes", Kind::Volume, 0.6, "dash"),
    ("splash", Kind::Volume, 5.0, "splash"),
    ("splashes", Kind::Volume, 5.0, "splash"),
    ("shot", Kind::Volume, 30.0, "shot"),
    ("shots", Kind::Volume, 30.0, "shot"),
    // mass
    ("g", Kind::Mass, 1.0, "g"),
    ("gram", Kind::Mass, 1.0, "g"),
    ("grams", Kind::Mass, 1.0, "g"),
    ("gr", Kind::Mass, 1.0, "g"),
    ("kg", Kind::Mass, 1000.0, "kg"),
    ("kilogram", Kind::Mass, 1000.0, "kg"),
    ("kilograms", Kind::Mass, 1000.0, "kg"),
    ("mg", Kind::Mass, 0.001, "mg"),
    ("oz", Kind::Mass, 28.3495, "oz"),
    ("ounce", Kind::Mass, 28.3495, "oz"),
    ("ounces", Kind::Mass, 28.3495, "oz"),
    ("lb", Kind::Mass, 453.592, "lb"),
    ("lbs", Kind::Mass, 453.592, "lb"),
    ("pound", Kind::Mass, 453.592, "lb"),
    ("pounds", Kind::Mass, 453.592, "lb"),
    ("stick", Kind::Mass, 113.0, "stick"),
    ("sticks", Kind::Mass, 113.0, "stick"),
    // count
    ("clove", Kind::Count, 1.0, "clove"),
    ("cloves", Kind::Count, 1.0, "clove"),
    ("can", Kind::Count, 1.0, "can"),
    ("cans", Kind::Count, 1.0, "can"),
    ("tin", Kind::Count, 1.0, "tin"),
    ("tins", Kind::Count, 1.0, "tin"),
    ("jar", Kind::Count, 1.0, "jar"),
    ("jars", Kind::Count, 1.0, "jar"),
    ("bunch", Kind::Count, 1.0, "bunch"),
    ("bunches", Kind::Count, 1.0, "bunch"),
    ("sprig", Kind::Count, 1.0, "sprig"),
    ("sprigs", Kind::Count, 1.0, "sprig"),
    ("slice", Kind::Count, 1.0, "slice"),
    ("slices", Kind::Count, 1.0, "slice"),
    ("piece", Kind::Count, 1.0, "piece"),
    ("pieces", Kind::Count, 1.0, "piece"),
    ("head", Kind::Count, 1.0, "head"),
    ("heads", Kind::Count, 1.0, "head"),
    ("stalk", Kind::Count, 1.0, "stalk"),
    ("stalks", Kind::Count, 1.0, "stalk"),
    ("packet", Kind::Count, 1.0, "packet"),
    ("packets", Kind::Count, 1.0, "packet"),
    ("pkg", Kind::Count, 1.0, "packet"),
    ("package", Kind::Count, 1.0, "packet"),
    ("sheet", Kind::Count, 1.0, "sheet"),
    ("sheets", Kind::Count, 1.0, "sheet"),
    ("fillet", Kind::Count, 1.0, "fillet"),
    ("fillets", Kind::Count, 1.0, "fillet"),
    ("pinch", Kind::Count, 1.0, "pinch"),
    ("pinches", Kind::Count, 1.0, "pinch"),
    ("handful", Kind::Count, 1.0, "handful"),
    ("handfuls", Kind::Count, 1.0, "handful"),
    ("scoop", Kind::Count, 1.0, "scoop"),
    ("scoops", Kind::Count, 1.0, "scoop"),
    ("drop", Kind::Count, 1.0, "drop"),
    ("drops", Kind::Count, 1.0, "drop"),
];

pub fn lookup(token: &str) -> Option<Unit> {
    let t = token.trim().trim_end_matches('.').to_lowercase();
    UNITS
        .iter()
        .find(|(name, _, _, _)| *name == t)
        .map(|(_, kind, base, canonical)| Unit {
            canonical,
            kind: *kind,
            base: *base,
        })
}

pub fn unit_for_ingredient(ing: &Ingredient) -> Option<Unit> {
    ing.unit.as_deref().and_then(lookup)
}

pub fn is_no_plural(canonical: &str) -> bool {
    matches!(
        canonical,
        "g" | "kg" | "mg" | "ml" | "l" | "oz" | "lb" | "fl oz" | "tbsp" | "tsp"
    )
}

pub fn pluralize(canonical: &str, amount: f64) -> String {
    if amount == 1.0 || is_no_plural(canonical) {
        return canonical.to_string();
    }
    if canonical.ends_with('s') || canonical.ends_with('x') || canonical.ends_with("ch") || canonical.ends_with("sh") {
        format!("{}es", canonical)
    } else {
        format!("{}s", canonical)
    }
}

/// Display-friendly rounding for a quantity.
pub fn round_qty(v: f64, kind: Kind, system: &str) -> f64 {
    match kind {
        Kind::Mass => {
            if system == "imperial" {
                // rounds to a clean ounce/lb value later
                round_to(v, 0.25)
            } else if v < 10.0 {
                round_to(v, 0.5)
            } else if v < 100.0 {
                round_to(v, 1.0)
            } else if v < 1000.0 {
                round_to(v, 5.0)
            } else {
                round_to(v, 10.0)
            }
        }
        Kind::Volume => {
            if system == "imperial" {
                round_to(v, 0.125)
            } else if v < 10.0 {
                round_to(v, 0.5)
            } else if v < 100.0 {
                round_to(v, 1.0)
            } else if v < 1000.0 {
                round_to(v, 5.0)
            } else {
                round_to(v, 10.0)
            }
        }
        Kind::Count => {
            if v < 6.0 {
                round_to(v, 0.5)
            } else {
                round_to(v, 1.0)
            }
        }
    }
}

fn round_to(v: f64, step: f64) -> f64 {
    if step <= 0.0 {
        return v;
    }
    (v / step).round() * step
}

const FRACTIONS: &[(f64, &str)] = &[
    (0.0, ""),
    (0.125, "⅛"),
    (0.25, "¼"),
    (0.3333, "⅓"),
    (0.375, "⅜"),
    (0.5, "½"),
    (0.625, "⅝"),
    (0.6667, "⅔"),
    (0.75, "¾"),
    (0.875, "⅞"),
    (1.0, ""),
];

pub fn format_qty(v: f64, kind: Kind) -> String {
    match kind {
        Kind::Count => {
            let r = round_to(v, 0.5);
            if (r - r.round()).abs() < 0.01 {
                format!("{}", r.round() as i64)
            } else {
                fraction_string(r)
            }
        }
        Kind::Volume => fraction_string(v),
        Kind::Mass => {
            if (v - v.round()).abs() < 0.05 || v >= 20.0 {
                format!("{}", v.round() as i64)
            } else {
                let r = round_to(v, 0.5);
                if (r - r.round()).abs() < 0.01 {
                    format!("{}", r.round() as i64)
                } else {
                    fraction_string(r)
                }
            }
        }
    }
}

fn fraction_string(v: f64) -> String {
    if v <= 0.0 {
        return "0".to_string();
    }
    let whole = v.floor();
    let frac = v - whole;
    let mut best = FRACTIONS[0];
    for &(value, label) in FRACTIONS {
        if (value - frac).abs() < (best.0 - frac).abs() {
            best = (value, label);
        }
    }
    if best.1.is_empty() {
        if best.0 == 0.0 {
            format!("{}", whole as i64)
        } else {
            format!("{}", whole as i64 + 1)
        }
    } else if whole == 0.0 {
        best.1.to_string()
    } else {
        format!("{} {}", whole as i64, best.1)
    }
}

/// Convert an amount expressed in `unit` into the best display unit for the
/// chosen measurement system. Returns (amount, unit, kind).
pub fn display_amount(
    qty: f64,
    unit: Option<&str>,
    system: &str,
    cup_grams: Option<f64>,
) -> (f64, String, Kind) {
    let def = match unit.and_then(lookup) {
        Some(d) => d,
        None => {
            let kind = Kind::Count;
            let rounded = round_qty(qty, kind, system);
            return (rounded, String::new(), kind);
        }
    };
    let base = qty * def.base;
    match def.kind {
        Kind::Count => {
            let rounded = round_qty(qty, Kind::Count, system);
            (rounded, def.canonical.to_string(), Kind::Count)
        }
        Kind::Mass => {
            if system == "imperial" {
                let oz = base / 28.3495;
                if oz >= 16.0 {
                    let lb = oz / 16.0;
                    (round_to(lb, 0.25), "lb".into(), Kind::Mass)
                } else {
                    (round_to(oz, 0.25), "oz".into(), Kind::Mass)
                }
            } else if base >= 1000.0 {
                (round_to(base / 1000.0, 0.05), "kg".into(), Kind::Mass)
            } else {
                (round_qty(base, Kind::Mass, "metric"), "g".into(), Kind::Mass)
            }
        }
        Kind::Volume => {
            if system == "imperial" {
                let ml = base;
                if ml >= 120.0 {
                    (round_to(ml / 240.0, 0.125), "cup".into(), Kind::Volume)
                } else if ml >= 30.0 {
                    (round_to(ml / 15.0, 0.125), "tbsp".into(), Kind::Volume)
                } else {
                    (round_to(ml / 5.0, 0.125), "tsp".into(), Kind::Volume)
                }
            } else if def.canonical == "cup" {
                // Cups of dry goods read best as grams; liquids stay in millilitres.
                match cup_grams {
                    Some(cup_g) => {
                        let grams = (base / 240.0) * cup_g;
                        if grams >= 1000.0 {
                            (round_to(grams / 1000.0, 0.05), "kg".into(), Kind::Mass)
                        } else {
                            (round_qty(grams, Kind::Mass, "metric"), "g".into(), Kind::Mass)
                        }
                    }
                    None => (round_qty(base, Kind::Volume, "metric"), "ml".into(), Kind::Volume),
                }
            } else if matches!(def.canonical, "tbsp" | "tsp" | "dash" | "splash") {
                // Spoon measures are already metric-friendly.
                (round_qty(qty, Kind::Volume, "metric"), def.canonical.to_string(), Kind::Volume)
            } else if base >= 1000.0 {
                (round_to(base / 1000.0, 0.05), "l".into(), Kind::Volume)
            } else {
                (round_qty(base, Kind::Volume, "metric"), "ml".into(), Kind::Volume)
            }
        }
    }
}

/// Just the amount (e.g. "1½ cups") without the ingredient name.
pub fn amount_text(
    qty: Option<f64>,
    unit: Option<&str>,
    system: &str,
    cup_grams: Option<f64>,
) -> Option<String> {
    let q = qty?;
    let (amount, display_unit, kind) = display_amount(q, unit, system, cup_grams);
    if display_unit.is_empty() {
        Some(format_qty(amount, kind))
    } else {
        Some(format!(
            "{} {}",
            format_qty(amount, kind),
            pluralize(&display_unit, amount)
        ))
    }
}

pub fn scaled_text(
    qty: Option<f64>,
    unit: Option<&str>,
    item: &str,
    system: &str,
    cup_grams: Option<f64>,
    note: Option<&str>,
) -> String {
    let mut out = match qty {
        Some(q) => {
            let (amount, display_unit, kind) = display_amount(q, unit, system, cup_grams);
            let amount_text = format_qty(amount, kind);
            if display_unit.is_empty() {
                let shown_item = if amount != 1.0 {
                    pluralize_item(item)
                } else {
                    item.to_string()
                };
                format!("{} {}", amount_text, shown_item)
            } else {
                format!("{} {} {}", amount_text, pluralize(&display_unit, amount), item)
            }
        }
        None => match unit {
            Some(u) if !u.is_empty() => format!("{} of {}", u, item),
            _ => item.to_string(),
        },
    };
    if let Some(n) = note {
        if !n.trim().is_empty() {
            out.push_str(", ");
            out.push_str(n.trim());
        }
    }
    capitalize_first(&out)
}

fn capitalize_first(input: &str) -> String {
    let mut chars = input.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}


const UNCOUNTABLE: &[&str] = &[
    "fish", "rice", "pasta", "bread", "cheese", "spinach", "garlic", "chicken", "beef",
    "pork", "lamb", "salmon", "tuna", "tofu", "honey", "yogurt", "flour", "sugar", "salt",
    "pepper", "water", "oil", "milk", "butter", "cream", "jam", "chocolate", "corn",
    "broccoli", "cauliflower", "asparagus", "couscous", "quinoa", "bacon", "sausage",
];

pub fn pluralize_item(item: &str) -> String {
    let words: Vec<&str> = item.split_whitespace().collect();
    if words.is_empty() {
        return item.to_string();
    }
    let last = words.len() - 1;
    let word = words[last];
    if UNCOUNTABLE.contains(&word) || word.ends_with('s') {
        return item.to_string();
    }
    let plural = if word == "potato" || word == "tomato" {
        format!("{}es", word)
    } else if word.ends_with("ch") || word.ends_with("sh") || word.ends_with('x') {
        format!("{}es", word)
    } else if word.ends_with('y') && word.len() > 2 {
        format!("{}ies", &word[..word.len() - 1])
    } else {
        format!("{}s", word)
    };
    if last == 0 {
        plural
    } else {
        format!("{} {}", words[..last].join(" "), plural)
    }
}

#[cfg(test)]
mod plural_tests {
    use super::*;

    #[test]
    fn count_items_get_pluralised() {
        assert_eq!(scaled_text(Some(2.0), None, "lemon", "metric", None, None), "2 lemons");
        assert_eq!(scaled_text(Some(3.0), None, "egg", "metric", None, None), "3 eggs");
        assert_eq!(scaled_text(Some(1.0), None, "lemon", "metric", None, None), "1 lemon");
        assert_eq!(scaled_text(Some(4.0), None, "garlic", "metric", None, None), "4 garlic");
        assert_eq!(scaled_text(Some(2.0), None, "sweet potato", "metric", None, None), "2 sweet potatoes");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fractions_render_nicely() {
        assert_eq!(format_qty(1.5, Kind::Volume), "1 ½");
        assert_eq!(format_qty(0.333, Kind::Volume), "⅓");
        assert_eq!(format_qty(0.25, Kind::Volume), "¼");
        assert_eq!(format_qty(2.0, Kind::Volume), "2");
    }

    #[test]
    fn metric_conversion_uses_density() {
        let (amount, unit, _) = display_amount(1.0, Some("cup"), "metric", Some(125.0));
        assert_eq!(unit, "g");
        assert_eq!(amount, 125.0);
    }

    #[test]
    fn imperial_conversion_from_grams() {
        let (amount, unit, _) = display_amount(500.0, Some("g"), "imperial", None);
        assert_eq!(unit, "lb");
        assert!((amount - 1.0).abs() < 0.3);
    }

    #[test]
    fn plurals() {
        assert_eq!(pluralize("cup", 2.0), "cups");
        assert_eq!(pluralize("pinch", 3.0), "pinches");
        assert_eq!(pluralize("g", 200.0), "g");
    }
}
