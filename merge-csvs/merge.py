# /// script
# dependencies = [
#   "pandas",
# ]
# ///

import argparse
from pathlib import Path
import pandas as pd


def read_csv_columns(file_path):
    """Read only the header of a CSV, returning its column names."""
    df = pd.read_csv(file_path, header=0, nrows=0, dtype=str, keep_default_na=False)
    return list(df.columns)


def collect_input_files(inputs):
    """Expand positional args and -d directories into a sorted list of CSV paths."""
    files = []
    for item in inputs:
        path = Path(item)
        if path.is_dir():
            files.extend(sorted(path.glob("*.csv")))
        elif path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"Path not found: {path}")
    return files


def main():
    parser = argparse.ArgumentParser(description="Merge multiple CSV files with the same columns into one CSV.")
    parser.add_argument("inputs", nargs="*", type=str, help="One or more CSV files or directories")
    parser.add_argument("-d", "--dir", type=str, help="Merge all *.csv files in a directory")
    parser.add_argument("-o", "--output", type=str, default="merged.csv", help="Output CSV path (default: merged.csv)")
    args = parser.parse_args()

    raw_inputs = list(args.inputs)
    if args.dir:
        raw_inputs.append(args.dir)
    if not raw_inputs:
        parser.error("Provide at least one CSV file or use -d/--dir")

    files = collect_input_files(raw_inputs)
    if not files:
        raise FileNotFoundError("No CSV files found.")

    # Validate that all files share the same columns (order included)
    reference_columns = read_csv_columns(files[0])
    for file_path in files[1:]:
        columns = read_csv_columns(file_path)
        if columns != reference_columns:
            raise ValueError(
                f"Column mismatch between files:\n"
                f"  {files[0]} -> {reference_columns}\n"
                f"  {file_path} -> {columns}"
            )

    print(f"Merging {len(files)} file(s) into {args.output}...")

    frames = []
    for file_path in files:
        df = pd.read_csv(file_path, header=0, dtype=str, keep_default_na=False)
        frames.append(df)

    merged = pd.concat(frames, ignore_index=True)
    output_path = Path(args.output)
    merged.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"Done! {len(files)} file(s) merged into {len(merged)} rows.")


if __name__ == "__main__":
    main()
