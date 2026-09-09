function dateOnly(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function isWithinDateRange(value, startInput = "startDate", endInput = "endDate") {
  const rowDate = dateOnly(value);
  const start = document.getElementById(startInput)?.value || "";
  const end = document.getElementById(endInput)?.value || "";
  if (!rowDate) return !start && !end;
  return (!start || rowDate >= start) && (!end || rowDate <= end);
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet software from interpreting exported user data as a
  // formula when an administrator opens the CSV file.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map((column) => csvCell(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(","));
  const blob = new Blob(["\ufeff", [header, ...body].join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function bindDateCsvExport({
  getRows,
  columns,
  filename,
  render,
  startInput = "startDate",
  endInput = "endDate",
  button = "exportCsvBtn",
}) {
  const start = document.getElementById(startInput);
  const end = document.getElementById(endInput);
  const exportButton = document.getElementById(button);

  const validateRange = () => {
    const valid = !start?.value || !end?.value || start.value <= end.value;
    start?.classList.toggle("input-invalid", !valid);
    end?.classList.toggle("input-invalid", !valid);
    exportButton && (exportButton.disabled = !valid);
    return valid;
  };

  const rangeChanged = () => {
    if (validateRange()) render();
  };
  start?.addEventListener("change", rangeChanged);
  end?.addEventListener("change", rangeChanged);

  exportButton?.addEventListener("click", () => {
    if (!validateRange()) {
      alert("Start Date must be before or equal to End Date.");
      return;
    }
    const rows = getRows();
    if (!rows.length) {
      alert("There are no records in the selected date range to export.");
      return;
    }
    const range = [start?.value, end?.value].filter(Boolean).join("_to_");
    downloadCsv(`${filename}${range ? `_${range}` : "_all"}.csv`, columns, rows);
  });
}
