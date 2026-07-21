# /// script
# dependencies = [
#   "pandas",
#   "openpyxl",
#   "xlrd",
#   "lxml",
# ]
# ///

import argparse
from pathlib import Path
import pandas as pd
from xlrd.biffh import XLRDError

def main():
    parser = argparse.ArgumentParser(description="Convert an XLSX or XLS file (including HTML-based XLS) to CSV.")
    parser.add_argument("input_file", type=str, help="Path to the input .xlsx or .xls file")
    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    file_extension = input_path.suffix.lower()
    if file_extension not in [".xlsx", ".xlsm", ".xls"]:
        raise ValueError(f"Unsupported file format: {file_extension}. Please provide a .xlsx, .xls, or .xlsm file.")

    output_path = input_path.with_suffix(".csv")
    print(f"Converting {input_path.name} to {output_path.name}...")

    df = None

    # Handle standard OpenXML files (.xlsx, .xlsm)
    if file_extension in [".xlsx", ".xlsm"]:
        df = pd.read_excel(input_path, header=0, engine="openpyxl")
    
    # Handle older/trickier .xls files
    elif file_extension == ".xls":
        try:
            # First, attempt to read as a genuine Excel binary
            df = pd.read_excel(input_path, header=0, engine="xlrd")
        except (XLRDError, ValueError) as e:
            # If it fails because it's actually an HTML file disguised as an XLS
            print("Detected HTML/XML disguised as XLS. Attempting to parse as HTML...")
            try:
                # Pass file path as a string to avoid Path object quirks in some parsers
                # We omit header=0 here to let pandas naturally detect <thead> tags if present
                tables = pd.read_html(str(input_path))
                if not tables:
                    raise ValueError("No HTML tables found in the file.")
                
                df = tables[0]
                
                # If pandas couldn't find a <thead>, it uses numbers (0, 1, 2) as column names.
                # In that scenario, we promote the first row to be the header.
                if list(df.columns) == list(range(len(df.columns))):
                    df.columns = df.iloc[0]
                    df = df[1:]
                    
            except Exception as html_err:
                raise RuntimeError(
                    f"Failed to parse file as Excel binary or as HTML. "
                    f"Original Excel error: {e}. HTML parser error: {html_err}"
                )

    # Write to CSV
    if df is not None:
        df.to_csv(output_path, index=False)
        print("Done!")
    else:
        print("Failed to load any data.")

if __name__ == "__main__":
    main()