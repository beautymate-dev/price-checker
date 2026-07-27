const form = document.getElementById("search-form");
const input = document.getElementById("search-term");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const term = input.value.trim();
  if (!term) return;

  statusEl.textContent = "Searching...";
  resultsEl.innerHTML = "";

  try {
    const res = await fetch(`/api/search?term=${encodeURIComponent(term)}`);
    const data = await res.json();
    render(term, data);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
});

function render(term, data) {
  const { items, errors } = data;

  const statusParts = [];
  statusParts.push(items.length === 0 ? `No specials found for "${term}".` : `${items.length} special(s) found for "${term}".`);
  if (errors.length > 0) {
    statusParts.push(`(${errors.map((e) => `${e.site}: ${e.message}`).join("; ")})`);
  }
  statusEl.textContent = statusParts.join(" ");

  resultsEl.innerHTML = items.map(renderItem).join("");
}

function renderItem(item) {
  const wasHtml = item.wasPrice ? `<span class="was">$${item.wasPrice.toFixed(2)}</span>` : "";
  const metaParts = [item.storeName, item.brand, item.size, item.specialLabel].filter(Boolean);
  return `
    <div class="item">
      <div>
        <div class="name"><span class="site-badge">${item.site}</span>${escapeHtml(item.productName)}</div>
        <div class="meta">${escapeHtml(metaParts.join(" · "))}</div>
      </div>
      <div class="price">${wasHtml}<span class="now">$${item.price.toFixed(2)}</span></div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
