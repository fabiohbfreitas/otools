use std::path::Path;

use anyhow::{Context, Result};
use calamine::{open_workbook, Data, Reader, Xlsx};

use crate::date::parse_cell_date;
use crate::model::ParsedRow;
use crate::normalize::{match_headers, resolve_specialty};
use crate::phone::extract_and_select_phones;

pub struct SheetData {
    pub sheet_name: String,
    pub rows: Vec<ParsedRow>,
    pub sem_data_count: usize,
}

pub struct WorkbookData {
    pub file_path: std::path::PathBuf,
    pub canonical_specialty: String,
    pub sheets: Vec<SheetData>,
}

pub fn process_workbook(path: &Path) -> Result<WorkbookData> {
    let mut workbook: Xlsx<_> = open_workbook(path)
        .with_context(|| format!("Failed to open Excel file: {}", path.display()))?;

    let file_stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut canonical_specialty = resolve_specialty(&file_stem).map(|s| s.to_string());

    let sheet_names = workbook.sheet_names().to_vec();
    let mut sheets_raw = Vec::new();

    for name in &sheet_names {
        if let Ok(range) = workbook.worksheet_range(name) {
            sheets_raw.push((name.clone(), range));
        }
    }

    if canonical_specialty.is_none() {
        'search_specialty: for (_, range) in &sheets_raw {
            if range.height() <= 1 {
                continue;
            }
            let first_row: Vec<String> = range
                .rows()
                .next()
                .map(|r| r.iter().map(cell_to_string).collect())
                .unwrap_or_default();

            if let Some(headers) = match_headers(&first_row) {
                for row in range.rows().skip(1) {
                    if let Some(cell) = row.get(headers.especialidade) {
                        let text = cell_to_string(cell);
                        if let Some(canon) = resolve_specialty(&text) {
                            canonical_specialty = Some(canon.to_string());
                            break 'search_specialty;
                        }
                    }
                }
            }
        }
    }

    let canonical = canonical_specialty.ok_or_else(|| {
        anyhow::anyhow!(
            "Could not determine specialty for file: {}",
            path.display()
        )
    })?;

    let mut processed_sheets = Vec::new();

    for (sheet_name, range) in sheets_raw {
        if range.height() <= 1 {
            continue;
        }

        let mut row_iter = range.rows();
        let header_row: Vec<String> = row_iter
            .next()
            .unwrap()
            .iter()
            .map(cell_to_string)
            .collect();

        let headers = match match_headers(&header_row) {
            Some(h) => h,
            None => continue,
        };

        let mut rows = Vec::new();
        let mut sem_data_count = 0;

        for (idx, row) in row_iter.enumerate() {
            let spreadsheet_row_num = idx + 2;

            let nome = row
                .get(headers.nome)
                .map(cell_to_string)
                .unwrap_or_default()
                .trim()
                .to_string();

            if nome.is_empty() {
                continue;
            }

            let date_cell = row
                .get(headers.data)
                .unwrap_or(&Data::Empty);

            let date_str = match parse_cell_date(date_cell, &sheet_name) {
                Some(d) => d,
                None => {
                    sem_data_count += 1;
                    continue;
                }
            };

            let tel_raw = row
                .get(headers.telefone)
                .map(cell_to_string)
                .unwrap_or_default();

            let (primary_phone, other_phones) = extract_and_select_phones(&tel_raw);

            rows.push(ParsedRow {
                source_row_idx: spreadsheet_row_num,
                nome,
                primary_phone,
                other_phones,
                date: date_str,
            });
        }

        processed_sheets.push(SheetData {
            sheet_name,
            rows,
            sem_data_count,
        });
    }

    Ok(WorkbookData {
        file_path: path.to_path_buf(),
        canonical_specialty: canonical,
        sheets: processed_sheets,
    })
}

pub fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Int(v) => v.to_string(),
        Data::Float(v) => v.to_string(),
        Data::String(v) => v.clone(),
        Data::Bool(v) => v.to_string(),
        Data::DateTimeIso(v) => v.clone(),
        Data::DurationIso(v) => v.clone(),
        _ => String::new(),
    }
}