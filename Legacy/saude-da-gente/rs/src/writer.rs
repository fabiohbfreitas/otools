use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use anyhow::{Context, Result};
use csv::{QuoteStyle, Terminator, WriterBuilder};

use crate::model::OutputRow;
use crate::normalize::sanitize_folder_name;

pub fn write_specialty_csv(
    output_base: &Path,
    day_sheet_name: &str,
    canonical_specialty: &str,
    rows: &[OutputRow],
) -> Result<()> {
    let day_dir_name = sanitize_folder_name(day_sheet_name);
    let day_dir = output_base.join(day_dir_name);
    fs::create_dir_all(&day_dir)?;

    let target_file = day_dir.join(format!("{canonical_specialty}.csv"));
    if target_file.exists() {
        fs::remove_file(&target_file)?;
    }

    write_csv_file(&target_file, rows)
}

pub fn write_daily_csv(
    output_base: &Path,
    date_iso: &str,
    rows: &[OutputRow],
) -> Result<()> {
    let target_file = output_base.join(format!("{date_iso}.csv"));
    if target_file.exists() {
        fs::remove_file(&target_file)?;
    }

    write_csv_file(&target_file, rows)
}

fn write_csv_file(path: &Path, rows: &[OutputRow]) -> Result<()> {
    let mut file = File::create(path)
        .with_context(|| format!("Failed to create file: {}", path.display()))?;

    file.write_all(b"\xEF\xBB\xBF")?;

    let mut wtr = WriterBuilder::new()
        .quote_style(QuoteStyle::Always)
        .terminator(Terminator::CRLF)
        .has_headers(false)
        .from_writer(file);

    wtr.write_record(["Nome", "Telefone", "Etiquetas", "Notas Internas"])?;

    for row in rows {
        wtr.write_record([
            &row.nome,
            &row.telefone,
            &row.etiquetas,
            &row.notas_internas,
        ])?;
    }

    wtr.flush()?;
    Ok(())
}