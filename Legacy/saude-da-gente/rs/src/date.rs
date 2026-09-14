use calamine::{Data, DataType};
use chrono::{Datelike, NaiveDate, Utc};
use lazy_static::lazy_static;
use regex::Regex;

lazy_static! {
    static ref DATE_ISO_REGEX: Regex = Regex::new(r"\b\d{4}-\d{2}-\d{2}\b").unwrap();
    static ref DATE_BR_REGEX: Regex = Regex::new(r"\b\d{1,2}/\d{1,2}/\d{4}\b").unwrap();
    static ref SHEET_DATE_REGEX: Regex = Regex::new(r"(\d{1,2})[-/](\d{1,2})").unwrap();
}

pub fn parse_cell_date(cell: &Data, sheet_name: &str) -> Option<String> {
    if let Some(d) = cell.as_date() {
        if d.year() > 1900 {
            return Some(d.format("%Y-%m-%d").to_string());
        }
    }

    if let Some(dt) = cell.as_datetime() {
        if dt.year() > 1900 {
            return Some(dt.format("%Y-%m-%d").to_string());
        }
    }

    let raw = match cell {
        Data::String(s) => s.trim().to_string(),
        Data::DateTimeIso(s) => s.trim().to_string(),
        _ => String::new(),
    };

    if !raw.is_empty() {
        if let Some(date_str) = parse_date_string(&raw) {
            return Some(date_str);
        }
    }

    parse_sheet_date(sheet_name)
}

fn parse_date_string(s: &str) -> Option<String> {
    let formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%d-%m-%Y",
    ];

    for fmt in formats {
        if let Ok(d) = NaiveDate::parse_from_str(s, fmt) {
            if d.year() > 1900 {
                return Some(d.format("%Y-%m-%d").to_string());
            }
        }
    }

    if let Some(mat) = DATE_ISO_REGEX.find(s) {
        if let Ok(d) = NaiveDate::parse_from_str(mat.as_str(), "%Y-%m-%d") {
            if d.year() > 1900 {
                return Some(d.format("%Y-%m-%d").to_string());
            }
        }
    }

    if let Some(mat) = DATE_BR_REGEX.find(s) {
        if let Ok(d) = NaiveDate::parse_from_str(mat.as_str(), "%d/%m/%Y") {
            if d.year() > 1900 {
                return Some(d.format("%Y-%m-%d").to_string());
            }
        }
        if let Ok(d) = NaiveDate::parse_from_str(mat.as_str(), "%m/%d/%Y") {
            if d.year() > 1900 {
                return Some(d.format("%Y-%m-%d").to_string());
            }
        }
    }

    None
}

fn parse_sheet_date(sheet_name: &str) -> Option<String> {
    let caps = SHEET_DATE_REGEX.captures(sheet_name.trim())?;
    let day: u32 = caps.get(1)?.as_str().parse().ok()?;
    let month: u32 = caps.get(2)?.as_str().parse().ok()?;
    let year = Utc::now().year();

    let d = NaiveDate::from_ymd_opt(year, month, day)?;
    Some(d.format("%Y-%m-%d").to_string())
}