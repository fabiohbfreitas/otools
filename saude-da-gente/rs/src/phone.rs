use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref PHONE_PATTERN: Regex =
        Regex::new(r"(?:\(?\d{2}\)?\s?\d{4,5}-?\d{4})").unwrap();
}

pub fn normalize_phone(raw: &str) -> String {
    let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 11 {
        format!(
            "({}) {}-{}",
            &digits[0..2],
            &digits[2..7],
            &digits[7..11]
        )
    } else if digits.len() == 10 {
        format!(
            "({}) {}-{}",
            &digits[0..2],
            &digits[2..6],
            &digits[6..10]
        )
    } else {
        raw.trim().to_string()
    }
}

pub fn extract_and_select_phones(cell_text: &str) -> (String, Vec<String>) {
    let mut extracted = Vec::new();
    for mat in PHONE_PATTERN.find_iter(cell_text) {
        extracted.push(normalize_phone(mat.as_str()));
    }

    if extracted.is_empty() {
        return (String::new(), Vec::new());
    }

    let mut chosen_idx = 0;
    for (i, ph) in extracted.iter().enumerate() {
        let digits: String = ph.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() >= 2 {
            let number_part = &digits[2..];
            if number_part.len() == 9 && number_part.starts_with('9') {
                chosen_idx = i;
                break;
            }
        }
    }

    let chosen = extracted.remove(chosen_idx);
    (chosen, extracted)
}