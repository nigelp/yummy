use crate::catalog;
use crate::model::Ingredient;
use crate::units;

fn normalize_fractions(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for ch in input.chars() {
        let replacement = match ch {
            '½' => Some(" 1/2 "),
            '¼' => Some(" 1/4 "),
            '¾' => Some(" 3/4 "),
            '⅓' => Some(" 1/3 "),
            '⅔' => Some(" 2/3 "),
            '⅛' => Some(" 1/8 "),
            '⅜' => Some(" 3/8 "),
            '⅝' => Some(" 5/8 "),
            '⅞' => Some(" 7/8 "),
            '–' => Some("-"),
            '—' => Some("-"),
            '\u{00a0}' => Some(" "),
            _ => None,
        };
        match replacement {
            Some(r) => out.push_str(r),
            None => out.push(ch),
        }
    }
    out
}

fn parse_number(token: &str) -> Option<(f64, Option<f64>)> {
    let t = token.trim().trim_matches(|c: char| c == ',' || c == ';');
    if t.is_empty() {
        return None;
    }
    if let Some((a, b)) = t.split_once('-') {
        if let (Some((left, _)), Some((right, _))) = (parse_number(a), parse_number(b)) {
            if right > left {
                return Some((left, Some(right)));
            }
        }
        return None;
    }
    if let Some((num, den)) = t.split_once('/') {
        let n: f64 = num.trim().parse().ok()?;
        let d: f64 = den.trim().parse().ok()?;
        if d == 0.0 {
            return None;
        }
        return Some((n / d, None));
    }
    t.parse::<f64>().ok().map(|v| (v, None))
}

fn is_fraction_token(token: &str) -> bool {
    token.contains('/')
}

fn looks_like_size(token: &str) -> bool {
    let first = token.chars().next();
    if !first.map(|c| c.is_ascii_digit()).unwrap_or(false) {
        return false;
    }
    let has_digit = token.chars().any(|c| c.is_ascii_digit());
    let has_letter = token.chars().any(|c| c.is_alphabetic());
    has_digit && has_letter
}


fn split_leading_size(token: &str) -> Option<(String, String)> {
    let mut cut = 0usize;
    for (i, c) in token.char_indices() {
        if c.is_ascii_digit() || c == '.' || c == '/' {
            cut = i + c.len_utf8();
        } else {
            break;
        }
    }
    if cut == 0 || cut == token.len() {
        return None;
    }
    let (num, rest) = token.split_at(cut);
    if parse_number(num).is_none() {
        return None;
    }
    Some((num.to_string(), rest.to_string()))
}

fn merge_parentheticals(tokens: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut buffer: Option<String> = None;
    for token in tokens {
        if let Some(mut open) = buffer.take() {
            open.push(' ');
            open.push_str(&token);
            if token.ends_with(')') {
                out.push(open);
            } else {
                buffer = Some(open);
            }
            continue;
        }
        if token.starts_with('(') && !token.ends_with(')') {
            buffer = Some(token);
        } else {
            out.push(token);
        }
    }
    if let Some(rest) = buffer {
        out.push(rest);
    }
    out
}

fn parse_leading_qty(tokens: &[String]) -> (Option<f64>, Option<f64>, usize) {
    if tokens.is_empty() {
        return (None, None, 0);
    }
    let cleaned = tokens[0].trim_matches(|c: char| c == ',' || c == '.');
    if let Some((value, max)) = parse_number(cleaned) {
        // Mixed number: "1 1/2"
        if max.is_none() && value.fract() == 0.0 && tokens.len() > 1 && is_fraction_token(&tokens[1]) {
            if let Some((frac, _)) = parse_number(&tokens[1]) {
                if frac > 0.0 && frac < 1.0 {
                    return (Some(value + frac), None, 2);
                }
            }
        }
        // "2 to 3"
        if max.is_none() && tokens.len() > 2 && (tokens[1].eq_ignore_ascii_case("to") || tokens[1] == "-") {
            if let Some((upper, _)) = parse_number(&tokens[2]) {
                return (Some(value), Some(upper), 3);
            }
        }
        return (Some(value), max, 1);
    }
    (None, None, 0)
}

pub fn parse(raw: &str) -> Ingredient {
    let original = raw.trim().to_string();
    let mut working = normalize_fractions(&original);
    working = working
        .trim_start_matches(|c: char| matches!(c, '-' | '•' | '*' | '·' | '–'))
        .trim()
        .to_string();

    let mut optional = false;
    let lower = working.to_lowercase();
    if lower.contains("optional") {
        optional = true;
        working = working
            .replace("(optional)", "")
            .replace("[optional]", "")
            .replace("optional", "");
    }

    let mut note_parts: Vec<String> = Vec::new();
    let mut tokens: Vec<String> = working.split_whitespace().map(|s| s.to_string()).collect();
    tokens = merge_parentheticals(tokens);
    if let Some(first) = tokens.first().cloned() {
        if parse_number(first.trim_matches(|c: char| c == ',' || c == '.')).is_none() {
            if let Some((num, rest)) = split_leading_size(&first) {
                if units::lookup(&rest).is_some() {
                    tokens[0] = num;
                    tokens.insert(1, rest);
                }
            }
        }
    }
    let tokens = tokens;
    let (qty, qty_max, mut idx) = parse_leading_qty(&tokens);

    if idx < tokens.len() && (tokens[idx].eq_ignore_ascii_case("x") || tokens[idx] == "×") {
        idx += 1;
    }

    // Parenthesised sizes and "2 x 400g cans".
    loop {
        if idx >= tokens.len() {
            break;
        }
        let token = &tokens[idx];
        if token.starts_with('(') && token.ends_with(')') {
            let inner = token.trim_matches(|c| c == '(' || c == ')').to_string();
            if !inner.is_empty() {
                note_parts.push(inner);
            }
            idx += 1;
            continue;
        }
        if qty.is_some() && looks_like_size(token) && idx + 1 < tokens.len() && units::lookup(&tokens[idx + 1]).is_some() {
            note_parts.push(token.clone());
            idx += 1;
            continue;
        }
        break;
    }

    // Unit, including "fl oz".
    let mut unit: Option<String> = None;
    let mut unit_kind: Option<String> = None;
    if idx < tokens.len() {
        let first = tokens[idx].to_lowercase();
        if (first == "fl" || first == "fluid") && idx + 1 < tokens.len() {
            let combined = format!("{} {}", first, tokens[idx + 1].to_lowercase());
            if let Some(def) = units::lookup(&combined) {
                unit = Some(def.canonical.to_string());
                unit_kind = Some(def.kind.as_str().to_string());
                idx += 2;
            }
        }
        if unit.is_none() {
            if let Some(def) = units::lookup(&first) {
                unit = Some(def.canonical.to_string());
                unit_kind = Some(def.kind.as_str().to_string());
                idx += 1;
            }
        }
    }

    let rest = tokens[idx..].join(" ");
    let (mut item, trailing_note) = match rest.find(',') {
        Some(pos) => (
            rest[..pos].trim().to_string(),
            Some(rest[pos + 1..].trim().to_string()),
        ),
        None => (rest.trim().to_string(), None),
    };
    if let Some(n) = trailing_note {
        if !n.is_empty() {
            note_parts.push(n);
        }
    }

    if item.to_lowercase().starts_with("of ") {
        item = item[3..].trim().to_string();
    }

    let lowered_item = item.to_lowercase();
    for suffix in [
        " to taste",
        " as needed",
        " for serving",
        " for garnish",
        " to serve",
    ] {
        if lowered_item.ends_with(suffix) {
            note_parts.push(suffix.trim().to_string());
            item.truncate(item.len() - suffix.len());
            break;
        }
    }

    item = item
        .trim()
        .trim_matches(|c: char| c == '.' || c == ',' || c == ';' || c == ':')
        .to_string();

    if item.is_empty() && original.is_empty() {
        return Ingredient::default();
    }
    if item.is_empty() && !original.is_empty() {
        item = original.clone();
    }

    let canonical_id = catalog::canonicalize(&item)
        .or_else(|| catalog::canonicalize(&original))
        .map(|i| i.id.clone());

    let note = if note_parts.is_empty() {
        None
    } else {
        Some(note_parts.join(", "))
    };

    Ingredient {
        raw: original,
        qty,
        qty_max,
        unit,
        unit_kind,
        item,
        canonical_id,
        note,
        optional,
    }
}

pub fn parse_many(lines: &[String]) -> Vec<Ingredient> {
    lines
        .iter()
        .filter(|l| !l.trim().is_empty())
        .map(|l| parse(l))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixed_fraction_and_unit() {
        let ing = parse("1 1/2 cups all-purpose flour, sifted");
        assert_eq!(ing.qty, Some(1.5));
        assert_eq!(ing.unit.as_deref(), Some("cup"));
        assert_eq!(ing.item, "all-purpose flour");
        assert_eq!(ing.canonical_id.as_deref(), Some("flour"));
        assert_eq!(ing.note.as_deref(), Some("sifted"));
    }

    #[test]
    fn range_and_no_unit() {
        let ing = parse("2–3 cloves garlic, minced");
        assert_eq!(ing.qty, Some(2.0));
        assert_eq!(ing.qty_max, Some(3.0));
        assert_eq!(ing.unit.as_deref(), Some("clove"));
        assert_eq!(ing.canonical_id.as_deref(), Some("garlic"));
    }

    #[test]
    fn packaged_size() {
        let ing = parse("1 (400 g) can chopped tomatoes");
        assert_eq!(ing.unit.as_deref(), Some("can"));
        assert_eq!(ing.canonical_id.as_deref(), Some("canned_tomatoes"));
        assert_eq!(ing.note.as_deref(), Some("400 g"));
    }

    #[test]
    fn multiplier_pack_size() {
        let ing = parse("2 x 400g cans coconut milk");
        assert_eq!(ing.qty, Some(2.0));
        assert_eq!(ing.unit.as_deref(), Some("can"));
        assert_eq!(ing.canonical_id.as_deref(), Some("coconut_milk"));
    }

    #[test]
    fn unit_without_quantity() {
        let ing = parse("Pinch of salt");
        assert_eq!(ing.qty, None);
        assert_eq!(ing.unit.as_deref(), Some("pinch"));
        assert_eq!(ing.canonical_id.as_deref(), Some("salt"));
    }

    #[test]
    fn optional_flag() {
        let ing = parse("1 tbsp olive oil (optional)");
        assert!(ing.optional);
        assert_eq!(ing.canonical_id.as_deref(), Some("olive_oil"));
    }

    #[test]
    fn grams() {
        let ing = parse("500g beef mince");
        assert_eq!(ing.qty, Some(500.0));
        assert_eq!(ing.unit.as_deref(), Some("g"));
        assert_eq!(ing.canonical_id.as_deref(), Some("beef"));
    }

    #[test]
    fn unicode_fraction() {
        let ing = parse("½ lemon, juiced");
        assert_eq!(ing.qty, Some(0.5));
        assert_eq!(ing.canonical_id.as_deref(), Some("lemon"));
    }
}
