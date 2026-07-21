# Convert XLSX (Excel file) into CSV

Use pandas to convert an XLSX file into a CSV file using the same name at the same path as the input file.
Also supports legacy excel files (XLS).

## How To Run

```sh
uv run convert.py <path-to-file>
```

Running
`uv run convert.py ..\..\data\santa-maria.xlsx` will create file `..\..\data\santa-maria.csv`
