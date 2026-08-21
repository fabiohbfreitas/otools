use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::process::ExitCode;

use anyhow::Result;
use csv::ReaderBuilder;

use crate::collect_files;
use crate::excel::process_workbook;
use crate::model::OutputRow;
use crate::normalize::sanitize_folder_name;

pub fn run_validation(target: &Path, check_daily: bool) -> Result<ExitCode> {
    let (files, output_base) = collect_files(target)?;
    let mut report_lines = Vec::new();
    let mut overall_has_errors = false;

    report_lines.push("# Relatório de Validação\n".to_string());

    let mut all_workbooks = Vec::new();
    for file in &files {
        let wb = process_workbook(file)?;
        all_workbooks.push(wb);
    }

    for wb in &all_workbooks {
        report_lines.push(format!("## Arquivo: `{}`", wb.file_path.display()));
        report_lines.push(format!("Especialidade: **{}**\n", wb.canonical_specialty));

        for sheet in &wb.sheets {
            let day_folder = sanitize_folder_name(&sheet.sheet_name);
            let csv_path = output_base
                .join(&day_folder)
                .join(format!("{}.csv", wb.canonical_specialty));

            let expected_rows: Vec<(usize, OutputRow)> = sheet
                .rows
                .iter()
                .map(|r| (r.source_row_idx, r.to_output_row(&wb.canonical_specialty)))
                .collect();

            let (has_err, lines) = validate_dataset(
                &format!("Aba `{}` -> `{}`", sheet.sheet_name, csv_path.display()),
                &csv_path,
                &expected_rows,
                sheet.sem_data_count,
            )?;

            if has_err {
                overall_has_errors = true;
            }
            report_lines.extend(lines);
        }
    }

    if check_daily {
        report_lines.push("## Arquivos Diários Combinados\n".to_string());
        let mut daily_expected: HashMap<String, Vec<(usize, OutputRow)>> = HashMap::new();

        for wb in &all_workbooks {
            for sheet in &wb.sheets {
                for r in &sheet.rows {
                    let out_row = r.to_output_row(&wb.canonical_specialty);
                    daily_expected
                        .entry(r.date.clone())
                        .or_default()
                        .push((r.source_row_idx, out_row));
                }
            }
        }

        let mut sorted_dates: Vec<String> = daily_expected.keys().cloned().collect();
        sorted_dates.sort();

        for date_iso in sorted_dates {
            let csv_path = output_base.join(format!("{date_iso}.csv"));
            let expected = &daily_expected[&date_iso];

            let (has_err, lines) = validate_dataset(
                &format!("Diário `{date_iso}` -> `{}`", csv_path.display()),
                &csv_path,
                expected,
                0,
            )?;

            if has_err {
                overall_has_errors = true;
            }
            report_lines.extend(lines);
        }
    }

    let report_content = report_lines.join("\n");
    println!("{report_content}");

    let report_file = output_base.join("validation-report.md");
    let mut f = File::create(report_file)?;
    f.write_all(report_content.as_bytes())?;

    if overall_has_errors {
        Ok(ExitCode::FAILURE)
    } else {
        Ok(ExitCode::SUCCESS)
    }
}

fn validate_dataset(
    title: &str,
    csv_path: &Path,
    expected_rows: &[(usize, OutputRow)],
    sem_data_count: usize,
) -> Result<(bool, Vec<String>)> {
    let mut out_lines = Vec::new();
    out_lines.push(format!("### {title}"));

    if !csv_path.exists() {
        out_lines.push(format!(
            "- Status: `arquivo não encontrado` | FALTANDO: {}",
            expected_rows.len()
        ));
        out_lines.push(String::new());
        return Ok((!expected_rows.is_empty(), out_lines));
    }

    let actual_rows = read_csv_rows(csv_path)?;

    let mut actual_by_key: HashMap<(String, String), Vec<OutputRow>> = HashMap::new();
    for row in actual_rows {
        let key = make_key(&row.nome, &row.etiquetas);
        actual_by_key.entry(key).or_default().push(row);
    }

    let mut ok_count = 0;
    let mut diff_count = 0;
    let mut missing_count = 0;
    let mut diff_messages = Vec::new();

    for (row_idx, exp) in expected_rows {
        let key = make_key(&exp.nome, &exp.etiquetas);
        if let Some(list) = actual_by_key.get_mut(&key) {
            if !list.is_empty() {
                let act = list.remove(0);
                let diffs = compare_rows(exp, &act);
                if diffs.is_empty() {
                    ok_count += 1;
                } else {
                    diff_count += 1;
                    for (field, expected_val, actual_val) in diffs {
                        diff_messages.push(format!(
                            "  - DIFF {field} linha {row_idx}: esperado '{expected_val}', obtido '{actual_val}'"
                        ));
                    }
                }
                continue;
            }
        }
        missing_count += 1;
        diff_messages.push(format!(
            "  - FALTANDO linha {row_idx}: {} ({}) - tel {}",
            exp.nome,
            extract_date_tag(&exp.etiquetas),
            exp.telefone
        ));
    }

    let mut extra_count = 0;
    for (_key, list) in actual_by_key {
        for extra in list {
            extra_count += 1;
            diff_messages.push(format!(
                "  - EXTRA: {} ({}) - tel {}",
                extra.nome,
                extract_date_tag(&extra.etiquetas),
                extra.telefone
            ));
        }
    }

    let summary = format!(
        "- **OK**: {ok_count} | **DIFERENTE**: {diff_count} | **FALTANDO**: {missing_count} | **EXTRA**: {extra_count} | **SEM DATA**: {sem_data_count}"
    );
    out_lines.push(summary);

    if !diff_messages.is_empty() {
        out_lines.extend(diff_messages);
    }
    out_lines.push(String::new());

    let has_error = diff_count > 0 || missing_count > 0 || extra_count > 0;
    Ok((has_error, out_lines))
}

fn make_key(nome: &str, etiquetas: &str) -> (String, String) {
    (nome.trim().to_string(), extract_date_tag(etiquetas))
}

fn extract_date_tag(etiquetas: &str) -> String {
    etiquetas
        .split(',')
        .next()
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn compare_rows(exp: &OutputRow, act: &OutputRow) -> Vec<(&'static str, String, String)> {
    let mut diffs = Vec::new();
    if exp.nome != act.nome {
        diffs.push(("Nome", exp.nome.clone(), act.nome.clone()));
    }
    if exp.telefone != act.telefone {
        diffs.push(("Telefone", exp.telefone.clone(), act.telefone.clone()));
    }
    if exp.etiquetas != act.etiquetas {
        diffs.push(("Etiquetas", exp.etiquetas.clone(), act.etiquetas.clone()));
    }
    if exp.notas_internas != act.notas_internas {
        diffs.push((
            "Notas Internas",
            exp.notas_internas.clone(),
            act.notas_internas.clone(),
        ));
    }
    diffs
}

fn read_csv_rows(path: &Path) -> Result<Vec<OutputRow>> {
    let mut file = File::open(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;

    let slice = if bytes.starts_with(b"\xEF\xBB\xBF") {
        &bytes[3..]
    } else {
        &bytes[..]
    };

    let mut csv_rdr = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(slice);

    let mut rows = Vec::new();
    for result in csv_rdr.deserialize() {
        let record: OutputRow = result?;
        rows.push(record);
    }
    Ok(rows)
}