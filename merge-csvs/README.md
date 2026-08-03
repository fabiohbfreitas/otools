# Merge CSV files

Merge multiple CSV files that share the same columns into a single CSV.

## How To Run

```sh
uv run merge.py file1.csv file2.csv [-o merged.csv]
```

Merge all CSVs in a directory:

```sh
uv run merge.py -d data_dir [-o merged.csv]
```

If `-o` is omitted, the result is written to `merged.csv` in the current directory.

Files are validated to have identical columns (names and order) before merging; a
mismatch aborts with an error. Output is written as UTF-8 with BOM to stay compatible
with Excel, and cell values are preserved as text (no type inference).
