(function setupMobilePortalTables() {
  function labelTable(table) {
    if (!(table instanceof HTMLTableElement) || table.closest(".tfro-system-loader, .report-modal-body")) return;

    table.classList.add("tfro-mobile-stack-table");
    const headerRow = table.querySelector("thead tr:last-child");
    const headers = headerRow
      ? [...headerRow.cells].map((cell, index) => cell.textContent.trim() || `Column ${index + 1}`)
      : [];

    table.querySelectorAll("tbody tr, tfoot tr").forEach((row) => {
      const cells = [...row.cells];
      const isMessageRow = cells.length === 1 && cells[0].colSpan > 1;
      row.classList.toggle("tfro-mobile-message-row", isMessageRow);
      cells.forEach((cell, index) => {
        const isSpanningCell = isMessageRow || cell.colSpan > 1;
        cell.classList.toggle("tfro-mobile-message-cell", isSpanningCell);
        if (isSpanningCell) delete cell.dataset.mobileLabel;
        else cell.dataset.mobileLabel = headers[index] || `Field ${index + 1}`;
      });
    });
  }

  function labelTables(root = document) {
    if (root instanceof HTMLTableElement) labelTable(root);
    root.querySelectorAll?.("main table").forEach(labelTable);
    const parentTable = root instanceof Element ? root.closest("table") : null;
    if (parentTable) labelTable(parentTable);
  }

  function initialize() {
    labelTables();
    const main = document.querySelector("main");
    if (!main) return;
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) labelTables(node);
      }));
    }).observe(main, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();

