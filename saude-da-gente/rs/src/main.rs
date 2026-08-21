mod date;
mod excel;
mod model;
mod normalize;
mod phone;
mod selftest;
mod validate;
mod writer;

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::Result;
use clap::Parser;

use crate::model::OutputRow;

#[derive(Parser, Debug)]
#[command(name = "process")]
struct Cli {
    #[arg(required_unless_present = "selftest")]
    target: Option<PathBuf>,

    #[arg(long)]
    daily: bool,

    #[arg(long)]
    validate: bool,

    #[arg(long)]
    selftest: bool,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    if cli.selftest {
        return match selftest::run_selftest() {
            Ok(_) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("{e}");
                ExitCode::FAILURE
            }
        };
    }

    let target = cli.target.as_ref().unwrap();
    let result = if cli.validate {
        validate::run_validation(target, cli.daily)
    } else {
        run_pipeline(target, cli.daily)
    };

    match result {
        Ok(code) => code,
        Err(e) => {
            eprintln!("Error: {e:?}");
            ExitCode::FAILURE
        }
    }
}

fn run_pipeline(target: &Path, daily: bool) -> Result<ExitCode> {
    let (files, output_base) = collect_files(target)?;
    let mut all_workbooks = Vec::new();

    for file in files {
        let wb_data = excel::process_workbook(&file)?;
        all_workbooks.push(wb_data);
    }

    let mut generated_specialties_per_day: HashSet<(String, String)> = HashSet::new();

    for wb in &all_workbooks {
        for sheet in &wb.sheets {
            let out_rows: Vec<OutputRow> = sheet
                .rows
                .iter()
                .map(|r| r.to_output_row(&wb.canonical_specialty))
                .collect();

            writer::write_specialty_csv(
                &output_base,
                &sheet.sheet_name,
                &wb.canonical_specialty,
                &out_rows,
            )?;

            generated_specialties_per_day.insert((
                sheet.sheet_name.clone(),
                wb.canonical_specialty.clone(),
            ));
        }
    }

    if daily {
        let mut daily_map: std::collections::BTreeMap<String, Vec<OutputRow>> =
            std::collections::BTreeMap::new();

        for wb in &all_workbooks {
            for sheet in &wb.sheets {
                for r in &sheet.rows {
                    let out_row = r.to_output_row(&wb.canonical_specialty);
                    daily_map
                        .entry(r.date.clone())
                        .or_default()
                        .push(out_row);
                }
            }
        }

        for (date_iso, rows) in daily_map {
            writer::write_daily_csv(&output_base, &date_iso, &rows)?;
        }
    }

    Ok(ExitCode::SUCCESS)
}

pub fn collect_files(target: &Path) -> Result<(Vec<PathBuf>, PathBuf)> {
    if target.is_file() {
        let parent = target
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        Ok((vec![target.to_path_buf()], parent))
    } else if target.is_dir() {
        let mut files = Vec::new();
        for entry in fs::read_dir(target)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "xlsx" {
                        files.push(path);
                    }
                }
            }
        }
        files.sort();
        Ok((files, target.to_path_buf()))
    } else {
        anyhow::bail!("Target does not exist: {}", target.display());
    }
}