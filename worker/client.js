let menus = [];
let currentMenuId = "";
let shared = null;
let busyVote = null;
let busyRequest = null;
let refreshSequence = 0;

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const menu = () => menus.find((entry) => entry.id === currentMenuId) || menus[0];

// Match the ingredient, keeping the complete name and quantity as readable text.
function ingredientIcon(ingredient) {
  const icons = [
    [/halvparten|rester|ferdig tacokjøtt/i, "🍲"],
    [/laks|ørret|torsk|fisk/i, "🐟"],
    [/kylling|kalkun/i, "🍗"],
    [/karbonadedeig|kjøtt|biff|mørbrad/i, "🥩"],
    [/prosciutto|skinke|bacon/i, "🥓"],
    [/brokkoli/i, "🥦"],
    [/gulrot/i, "🥕"],
    [/paprika/i, "🫑"],
    [/tomat/i, "🍅"],
    [/potet/i, "🥔"],
    [/avokado/i, "🥑"],
    [/agurk|squash/i, "🥒"],
    [/hvitløk/i, "🧄"],
    [/løk/i, "🧅"],
    [/sitron|lime/i, "🍋"],
    [/ingefær/i, "🫚"],
    [/koriander|basilikum|oregano|\burter?\b/i, "🌿"],
    [/kutta|grønt|salat/i, "🥬"],
    [/yoghurt|rømme|melk|fløte/i, "🥛"],
    [/mozzarella|norvegia|ost/i, "🧀"],
    [/smør/i, "🧈"],
    [/nudler|pasta|penne/i, "🍝"],
    [/ris/i, "🍚"],
    [/tortilla|lefse|pita/i, "🫓"],
    [/pizzadeig/i, "🍕"],
    [/egg/i, "🥚"],
    [/saus|sennep|olje/i, "🫙"],
  ];
  return icons.find(([pattern]) => pattern.test(ingredient))?.[1] || "🥣";
}

function renderIngredients(dish, checkboxes = false) {
  const groups = dish.ingredientGroups || [{ title: '', items: dish.ingredients }];
  return `<div class="ingredient-groups">${groups.map(group => `<section>${group.title ? `<h5>${escapeHtml(group.title)}</h5>` : ''}${checkboxes ? group.items.map(item => `<label><input type="checkbox"><span><span aria-hidden="true">${ingredientIcon(item)}</span> ${escapeHtml(item)}</span></label>`).join('') : `<ul>${group.items.map(item => `<li><span class="ingredient-icon" aria-hidden="true">${ingredientIcon(item)}</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>`}</section>`).join('')}</div>`;
}
function renderStep(step) {
  const split = step.indexOf(':');
  return split > 0 ? `<div><strong>${escapeHtml(step.slice(0, split))}</strong><br>${escapeHtml(step.slice(split + 1).trim())}</div>` : `<div>${escapeHtml(step)}</div>`;
}

function showError(message) {
  const element = byId("feedback-error");
  element.textContent = message;
  element.hidden = !message;
}

async function readResponse(response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Noe gikk galt");
  return result;
}

async function refresh() {
  const menuId = currentMenuId;
  const sequence = ++refreshSequence;
  const isCurrent = () => sequence === refreshSequence && menuId === currentMenuId;
  try {
    const result = await readResponse(await fetch(`/api/state?menuId=${encodeURIComponent(menuId)}`, { cache: "no-store" }));
    if (!isCurrent()) return;
    shared = result;
    byId("hello").textContent = `Hei, ${shared.displayName}`;
    showError("");
    renderVotes();
    renderRequests();
    renderPlanning();
    renderLibrary();
  } catch (error) {
    if (!isCurrent()) return;
    showError(error instanceof Error ? error.message : "Kunne ikke hente felles data");
    renderVotes();
    renderRequests();
    renderPlanning();
    renderLibrary();
  }
}

function renderMenu() {
  const selected = menu();
  byId("menu-notice").textContent = selected.notice || "Dette er et tidligere idéutkast, ikke en oppdatert handleliste eller bestilling.";
  byId("household-label").textContent = selected.servingsLabel || "Middag hele uken · 2 voksne + 2 barn";
  byId("menu-lead").textContent = `${selected.subtitle} · ${selected.dishes.length} middager · én fiskemiddag · fredagstaco · litt ekstra godt på lørdag.`;
  byId("day-nav").innerHTML = selected.dishes.map((dish) => `<a href="#${escapeHtml(dish.id)}">${escapeHtml(dish.day)}</a>`).join("");
  byId("dish-list").innerHTML = selected.dishes.map((dish, index) => `
    <article class="dish" id="${escapeHtml(dish.id)}">
      <div class="dish-main">
        <div class="dish-meta"><span class="day-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(dish.label)}</span></div>
        <h3>${escapeHtml(dish.title)}</h3>
        <p class="dish-note">${escapeHtml(dish.note)}</p>
      <aside class="ingredients" aria-label="Ingredienser ${escapeHtml(dish.day)}"><span class="ingredients-kicker">${escapeHtml(dish.servingsLabel || selected.servingsLabel || "Til fire personer")}</span><h4>Ingredienser</h4>${renderIngredients(dish)}<p>${escapeHtml(dish.pantry)}</p></aside>
        <div class="vote-row" data-vote-row="${escapeHtml(dish.id)}" aria-label="Vurder ${escapeHtml(dish.title)}"></div>
        <div class="meal-tools"><button type="button" data-cook="${escapeHtml(dish.id)}">Start matlaging</button><button type="button" data-favorite="${escapeHtml(dish.id)}" disabled>☆ Favoritt</button></div>
        <div class="meal-planning" data-planning="${escapeHtml(dish.id)}"></div>
        <div class="method"><h4>Slik gjør du</h4><ol>${dish.steps.map((step) => `<li>${renderStep(step)}</li>`).join("")}</ol></div>
        ${dish.leftovers ? `<aside class="leftovers"><h4>Rester til neste middag</h4><p>${escapeHtml(dish.leftovers)}</p></aside>` : ""}
      </div>

    </article>`).join("");
  renderVotes();
  renderPlanning();
}

function renderVotes() {
  for (const dish of menu().dishes) {
    const row = document.querySelector(`[data-vote-row="${dish.id}"]`);
    if (!row) continue;
    const counts = shared?.votes?.[dish.id] || { up: 0, down: 0, mine: 0 };
    const disabled = !shared || busyVote === dish.id ? "disabled" : "";
    row.innerHTML = `<span class="vote-label">Hva synes du?</span>
      <button type="button" class="vote-button ${counts.mine === 1 ? "selected" : ""}" data-vote="1" data-dish="${escapeHtml(dish.id)}" aria-pressed="${counts.mine === 1}" aria-label="Tommel opp for ${escapeHtml(dish.title)}" ${disabled}>👍 <span>${counts.up}</span></button>
      <button type="button" class="vote-button ${counts.mine === -1 ? "selected-down" : ""}" data-vote="-1" data-dish="${escapeHtml(dish.id)}" aria-pressed="${counts.mine === -1}" aria-label="Tommel ned for ${escapeHtml(dish.title)}" ${disabled}>👎 <span>${counts.down}</span></button>
      ${counts.mine ? '<span class="saved-label">Din vurdering er lagret</span>' : ""}`;
  }
}

function renderRequests() {
  const items = shared?.requests || [];
  byId("request-count").textContent = `${items.length} ${items.length === 1 ? "ønske" : "ønsker"}`;
  const target = byId("request-content");
  target.replaceChildren();
  if (!shared) {
    const paragraph = document.createElement("p"); paragraph.className = "empty-list"; paragraph.textContent = "Ønskelisten er ikke tilgjengelig akkurat nå."; target.append(paragraph); return;
  }
  if (items.length === 0) {
    const paragraph = document.createElement("p"); paragraph.className = "empty-list"; paragraph.textContent = "Ingen ønsker ennå. Legg til det dere mangler."; target.append(paragraph); return;
  }
  const list = document.createElement("ul");
  for (const item of items) {
    const line = document.createElement("li");
    const description = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = item.item;
    const author = document.createElement("small"); author.textContent = `Lagt til av ${item.displayName}`;
    description.append(name, author); line.append(description);
    if (item.mine) {
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Fjern"; remove.disabled = busyRequest === item.id; remove.setAttribute("aria-label", `Fjern ${item.item}`); remove.addEventListener("click", () => void removeRequest(item.id)); line.append(remove);
    }
    list.append(line);
  }
  target.append(list);
}

async function setVote(dishId, value) {
  if (busyVote || !shared) return;
  const previous = shared.votes[dishId]?.mine || 0;
  busyVote = dishId;
  renderVotes();
  try {
    await readResponse(await fetch("/api/votes", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ menuId: currentMenuId, dishId, vote: previous === value ? 0 : value }) }));
    await refresh();
  } catch (error) { showError(error instanceof Error ? error.message : "Kunne ikke lagre vurderingen"); }
  finally { busyVote = null; renderVotes(); }
}

async function addRequest(event) {
  event.preventDefault();
  const input = byId("shopping-item");
  const button = byId("request-submit");
  if (!input.value.trim()) return;
  button.disabled = true; button.textContent = "Lagrer …";
  try {
    await readResponse(await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: input.value }) }));
    input.value = "";
    await refresh();
  } catch (error) { showError(error instanceof Error ? error.message : "Kunne ikke lagre ønsket"); }
  finally { button.disabled = false; button.textContent = "Legg til"; }
}

async function removeRequest(id) {
  if (busyRequest) return;
  busyRequest = id; renderRequests();
  try {
    await readResponse(await fetch("/api/requests", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }));
    await refresh();
  } catch (error) { showError(error instanceof Error ? error.message : "Kunne ikke fjerne ønsket"); }
  finally { busyRequest = null; renderRequests(); }
}

async function start() {
  try {
    menus = await readResponse(await fetch("/menus.json"));
    if (!Array.isArray(menus) || menus.length === 0) throw new Error("Ingen meny er publisert ennå");
    currentMenuId = menus[0].id;
    const select = byId("menu-choice");
    for (const entry of menus) { const option = document.createElement("option"); option.value = entry.id; option.textContent = entry.subtitle; select.append(option); }
    select.addEventListener("change", () => { currentMenuId = select.value; shared = null; renderMenu(); void refresh(); });
    byId("dish-list").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-vote]");
      if (button) void setVote(button.dataset.dish, Number(button.dataset.vote));
    });
    byId("request-form").addEventListener("submit", (event) => void addRequest(event));
    setupFeatures();
    renderMenu();
    renderLibrary();
    await refresh();
  } catch (error) { showError(error instanceof Error ? error.message : "Kunne ikke åpne menyen"); }
}

void start();

const suggestionDrafts = new Map();
let preferenceBusy = false;
let cooking = null;
let cookingStep = 0;
let wakeLock = null;
let wantWake = false;

function isFavorite(menuId, dishId) {
  return !!shared?.favorites?.some(item => item.menuId === menuId && item.dishId === dishId);
}
function renderPlanning() {
  if (!menu()) return;
  for (const dish of menu().dishes) {
    const target = document.querySelector(`[data-planning="${dish.id}"]`);
    if (!target) continue;
    const decisions = shared?.decisions?.filter(item => item.dishId === dish.id) || [];
    const own = decisions.find(item => item.mine);
    const draft = suggestionDrafts.get(`${currentMenuId}/${dish.id}`);
    const disabled = !shared || preferenceBusy ? 'disabled' : '';
    target.innerHTML = `<div class="decision-list">${decisions.map(item => `<p><strong>${escapeHtml(item.displayName)}:</strong> ${item.status === 'approved' ? '✓ Godkjent' : `Ønsker bytte: ${escapeHtml(item.suggestion)}`}</p>`).join('')}</div>
      <button type="button" data-approve="${escapeHtml(dish.id)}" aria-pressed="${own?.status === 'approved'}" ${disabled}>${own?.status === 'approved' ? '✓ Godkjent av deg' : 'Godkjenn middag'}</button>
      ${own ? `<button type="button" data-clear-decision="${escapeHtml(dish.id)}" ${disabled}>Trekk tilbake mitt valg</button>` : ''}
      <details ${draft !== undefined ? "open" : ""}><summary>Foreslå en annen middag</summary><form data-suggestion="${escapeHtml(dish.id)}"><label for="suggest-${escapeHtml(dish.id)}">Hva vil du heller spise?</label><textarea id="suggest-${escapeHtml(dish.id)}" name="suggestion" minlength="2" maxlength="300" required ${disabled}>${escapeHtml(draft ?? own?.suggestion ?? '')}</textarea><small>Forslaget deles med familien og tas med når menyen oppdateres. Oppskriften og handlelisten endres ikke automatisk.</small><button type="submit" ${disabled}>Lagre bytteforslag</button></form></details>`;
    const favorite = document.querySelector(`[data-favorite="${dish.id}"]`);
    if (favorite) {
      favorite.textContent = isFavorite(currentMenuId, dish.id) ? '★ Lagret favoritt' : '☆ Favoritt';
      favorite.setAttribute('aria-pressed', String(isFavorite(currentMenuId, dish.id)));
      favorite.disabled = !shared || preferenceBusy;
    }
  }
}
async function savePreference(path, dishId, fields) {
  if (!shared || preferenceBusy) return;
  const menuId = currentMenuId;
  preferenceBusy = true;
  // Disable controls without replacing a draft while a save is in flight.
  document.querySelectorAll('.meal-planning button, .meal-planning textarea, [data-favorite]').forEach(element => { element.disabled = true; });
  try {
    await readResponse(await fetch(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ menuId, dishId, ...fields }) }));
    if (path === '/api/decisions') suggestionDrafts.delete(`${menuId}/${dishId}`);
    preferenceBusy = false;
    await refresh();
  } catch (error) {
    preferenceBusy = false;
    document.querySelectorAll('.meal-planning button, .meal-planning textarea, [data-favorite]').forEach(element => { element.disabled = !shared; });
    showError(error.message || 'Kunne ikke lagre valget');
  }
}
function selectMenu(menuId, dishId) {
  if (!menus.some(entry => entry.id === menuId)) return;
  currentMenuId = menuId;
  byId('menu-choice').value = menuId;
  shared = null;
  renderMenu();
  void refresh();
  byId(dishId || 'meny')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderLibrary() {
  byId('menu-history').innerHTML = menus.map(entry => `<button type="button" data-history="${escapeHtml(entry.id)}"><strong>${escapeHtml(entry.subtitle)}</strong><small>${escapeHtml(entry.status || 'Lagret meny')} · ${entry.dishes.length} middager</small></button>`).join('');
  const filter = byId('library-filter').value;
  if (!shared && filter !== 'all') { byId('recipe-library').textContent = 'Henter lagrede favoritter og vurderinger …'; return; }
  const dishes = menus.flatMap(entry => entry.dishes.map(dish => ({ entry, dish })));
  const visible = dishes.filter(({entry, dish}) => {
    if (filter === 'all') return true;
    if (filter === 'favorites') return isFavorite(entry.id, dish.id);
    const rating = shared?.ratings?.find(item => item.menuId === entry.id && item.dishId === dish.id);
    return rating?.up >= 2 && rating.down === 0;
  });
  byId('recipe-library').innerHTML = visible.length ? visible.map(({entry, dish}) => `<button type="button" class="recipe-card" data-open-menu="${escapeHtml(entry.id)}" data-open-dish="${escapeHtml(dish.id)}"><strong>${escapeHtml(dish.title)}</strong><small>${escapeHtml(entry.subtitle)} · ${escapeHtml(dish.day)}</small><span>Åpne oppskrift →</span></button>`).join('') : `<p>${filter === 'liked' ? 'Her vises retter med minst to tomler opp og ingen tomler ned.' : 'Ingen favoritter ennå. Trykk ☆ Favoritt ved en middag for å lagre den her.'}</p>`;
}
function renderCookingStep() {
  byId('cook-progress').textContent = `Steg ${cookingStep + 1} av ${cooking.steps.length}`;
  byId('cook-step').textContent = cooking.steps[cookingStep];
  byId('cook-prev').disabled = cookingStep === 0;
  byId('cook-next').textContent = cookingStep === cooking.steps.length - 1 ? 'Ferdig ✓' : 'Neste →';
  byId('cook-next').disabled = false;
  byId('cook-complete').hidden = true;
}
function openCooking(dishId) {
  cooking = menu().dishes.find(dish => dish.id === dishId);
  if (!cooking) return;
  cookingStep = 0;
  byId('cook-title').textContent = cooking.title;
  byId('cook-ingredients').innerHTML = renderIngredients(cooking, true);
  byId('cook-leftovers').textContent = cooking.leftovers || '';
  byId('cook-leftovers').hidden = !cooking.leftovers;
  byId('cook-pantry').textContent = cooking.pantry;
  byId('wake-status').textContent = navigator.wakeLock ? 'Valgfritt: hold skjermen våken mens du lager mat.' : 'Denne nettleseren støtter ikke å holde skjermen våken.';
  byId('wake-toggle').disabled = !navigator.wakeLock;
  renderCookingStep();
  byId('cook-dialog').showModal();
}
async function acquireWake() {
  if (!wantWake || !byId('cook-dialog').open || document.visibilityState !== 'visible') return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!wantWake || !byId('cook-dialog').open) { await lock.release(); return; }
    wakeLock = lock;
    byId('wake-status').textContent = 'Skjermen holdes våken mens denne siden er synlig.';
    lock.addEventListener('release', () => {
      if (wakeLock === lock) {
        wakeLock = null;
        byId('wake-status').textContent = wantWake ? 'Skjermlåsen er pauset. Aktiver på nytt om nødvendig.' : 'Vanlig skjermlås er aktiv.';
      }
    });
  } catch { byId('wake-status').textContent = 'Nettleseren tillot ikke skjermlåsen. Du kan fortsatt bruke oppskriften.'; }
}
function stopWake() {
  wantWake = false;
  byId('wake-toggle').setAttribute('aria-pressed', 'false');
  byId('wake-toggle').textContent = 'Hold skjermen våken';
  if (wakeLock) void wakeLock.release();
}
function setupFeatures() {
  setupPantry();
  byId('dish-list').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.cook) openCooking(button.dataset.cook);
    if (button.dataset.favorite) void savePreference('/api/favorites', button.dataset.favorite, { enabled: !isFavorite(currentMenuId, button.dataset.favorite) });
    if (button.dataset.approve) void savePreference('/api/decisions', button.dataset.approve, { status: 'approved' });
    if (button.dataset.clearDecision) void savePreference('/api/decisions', button.dataset.clearDecision, { status: 'none' });
  });
  byId('dish-list').addEventListener('input', event => {
    const form = event.target.closest('form[data-suggestion]');
    if (form) suggestionDrafts.set(`${currentMenuId}/${form.dataset.suggestion}`, form.elements.suggestion.value);
  });
  byId('dish-list').addEventListener('submit', event => {
    const form = event.target.closest('form[data-suggestion]');
    if (!form) return;
    event.preventDefault();
    void savePreference('/api/decisions', form.dataset.suggestion, { status: 'change', suggestion: form.elements.suggestion.value });
  });
  byId('menu-history').addEventListener('click', event => { const button = event.target.closest('[data-history]'); if (button) selectMenu(button.dataset.history); });
  byId('recipe-library').addEventListener('click', event => { const button = event.target.closest('[data-open-menu]'); if (button) selectMenu(button.dataset.openMenu, button.dataset.openDish); });
  byId('library-filter').addEventListener('change', renderLibrary);
  byId('cook-close').addEventListener('click', () => byId('cook-dialog').close());
  byId('cook-dialog').addEventListener('close', stopWake);
  byId('cook-prev').addEventListener('click', () => { if (cookingStep > 0) { cookingStep--; renderCookingStep(); } });
  byId('cook-next').addEventListener('click', () => {
    if (cookingStep < cooking.steps.length - 1) { cookingStep++; renderCookingStep(); }
    else { byId('cook-complete').hidden = false; byId('cook-next').disabled = true; stopWake(); }
  });
  byId('wake-toggle').addEventListener('click', () => {
    if (wantWake) { stopWake(); byId('wake-status').textContent = 'Vanlig skjermlås er aktiv.'; }
    else { wantWake = true; byId('wake-toggle').setAttribute('aria-pressed', 'true'); byId('wake-toggle').textContent = 'Slå av våken skjerm'; void acquireWake(); }
  });
  document.addEventListener('visibilitychange', () => { if (wantWake && !wakeLock) void acquireWake(); });
}

let pantryItems = [];
let pantryRevision = 0;
let pantryBusy = false;
let pantryReadSequence = 0;
const formatAmount = value => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 3 }).format(value);
function parseAmount(value) {
  const text = value.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}
function pantryDescription(item) {
  if (item.certainty === 'empty') return 'Tomt';
  if (item.certainty === 'unknown') return 'Har noe – mengde må avklares';
  const prefix = item.certainty === 'approx' ? 'Ca. ' : '';
  let text = `${prefix}${formatAmount(item.quantity)} ${item.unit}`;
  if (item.unit === 'pakker') text += item.packageSize == null ? ' · størrelse ukjent' : ` à ${formatAmount(item.packageSize)} ${item.packageUnit}`;
  if (item.unit === 'pakker' && item.normalized) text += ` = ${formatAmount(item.normalized.quantity)} ${item.normalized.unit}`;
  return text;
}
function renderPantry() {
  byId('pantry-list').innerHTML = pantryItems.length ? pantryItems.map((item, index) => {
    const old = Date.now() - new Date(item.updatedAt).getTime() >= 7 * 86400000;
    const date = new Date(item.updatedAt).toLocaleDateString('nb-NO', { timeZone: 'Europe/Oslo', day:'numeric', month:'short', year:'numeric' });
    return `<article class="pantry-card"><div><h3>${escapeHtml(item.name)}</h3><strong>${escapeHtml(pantryDescription(item))}</strong>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}<small>Sjekket ${escapeHtml(date)} av ${escapeHtml(item.displayName)}</small>${old ? '<p class="pantry-warning">Sjekk på nytt før neste handel – minst én uke siden sist.</p>' : ''}${item.certainty === 'unknown' || (item.unit === 'pakker' && item.packageSize == null) ? '<p class="pantry-warning">Mengden må avklares før den kan trekkes fra handlebehovet.</p>' : ''}</div><button type="button" data-edit-pantry="${index}" ${pantryBusy ? 'disabled' : ''}>Oppdater</button></article>`;
  }).join('') : '<p>Ingen beholdning registrert ennå. Legg til det dere har, med mengde. En manglende vare betyr ikke nødvendigvis at dere er tomme.</p>';
}
async function loadPantry() {
  const sequence = ++pantryReadSequence;
  try {
    const result = await readResponse(await fetch('/api/pantry', { cache:'no-store' }));
    if (sequence !== pantryReadSequence) return;
    pantryItems = result.items;
    renderPantry();
  } catch (error) {
    if (sequence !== pantryReadSequence) return;
    byId('pantry-message').textContent = error.message || 'Kunne ikke hente lageret';
  }
}
function updatePantryFields() {
  const known = ['exact','approx'].includes(byId('pantry-certainty').value);
  const packaged = known && byId('pantry-unit').value === 'pakker';
  byId('pantry-amount-fields').hidden = !known;
  byId('pantry-quantity').required = known;
  byId('pantry-package-fields').hidden = !packaged;
  const quantity = parseAmount(byId('pantry-quantity').value);
  const size = parseAmount(byId('pantry-package-size').value);
  let hint = '';
  if (!known) hint = byId('pantry-certainty').value === 'empty' ? 'Lagres som tomt. Det betyr ikke automatisk at varen må kjøpes.' : 'Lagres uten mengde. Vi må avklare den før handlelisten beregnes.';
  else if (packaged) hint = quantity > 0 && size > 0 ? `Totalt: ${formatAmount(quantity * size)} ${byId('pantry-package-unit').value}${byId('pantry-certainty').value === 'approx' ? ' (cirka)' : ''}` : 'Uten pakningsstørrelse vet vi antallet, men ikke total vekt eller volum.';
  byId('pantry-calculation').textContent = hint;
}
function resetPantryForm() {
  byId('pantry-form').reset(); pantryRevision = 0;
  byId('pantry-name').readOnly = false;
  byId('pantry-form-title').textContent = 'Legg til en vare';
  byId('pantry-cancel').hidden = true;
  updatePantryFields();
}
function editPantry(index) {
  const item = pantryItems[index];
  if (!item || pantryBusy) return;
  pantryRevision = item.revision;
  byId('pantry-name').value = item.name; byId('pantry-name').readOnly = true;
  byId('pantry-certainty').value = item.certainty;
  byId('pantry-quantity').value = item.quantity == null ? '' : String(item.quantity).replace('.', ',');
  byId('pantry-unit').value = item.unit || 'g';
  byId('pantry-package-size').value = item.packageSize == null ? '' : String(item.packageSize).replace('.', ',');
  byId('pantry-package-unit').value = item.packageUnit || 'g';
  byId('pantry-note').value = item.note;
  byId('pantry-form-title').textContent = `Oppdater ${item.name}`;
  byId('pantry-cancel').hidden = false;
  byId('pantry-message').textContent = '';
  updatePantryFields();
  byId('pantry-form').scrollIntoView({behavior:'smooth',block:'center'});
  byId('pantry-certainty').focus({preventScroll:true});
}
async function savePantry(event) {
  event.preventDefault();
  if (pantryBusy) return;
  const certainty = byId('pantry-certainty').value;
  const known = ['exact','approx'].includes(certainty);
  const quantity = parseAmount(byId('pantry-quantity').value);
  const sizeText = byId('pantry-package-size').value.trim();
  const packaged = known && byId('pantry-unit').value === 'pakker';
  const size = packaged && sizeText ? parseAmount(sizeText) : null;
  if ((known && !(quantity > 0 && quantity <= 100000)) || (size !== null && !(size > 0 && size <= 100000))) {
    byId('pantry-message').textContent = 'Oppgi et positivt tall, for eksempel 0,5. Velg Tomt for null beholdning.'; return;
  }
  const body = {name:byId('pantry-name').value, certainty, quantity:known?quantity:null, unit:byId('pantry-unit').value, packageSize:size, packageUnit:byId('pantry-package-unit').value, note:byId('pantry-note').value, revision:pantryRevision};
  pantryBusy = true;
  byId('pantry-form').querySelectorAll('input,select,button').forEach(element => { element.disabled = true; });
  renderPantry();
  byId('pantry-message').textContent = 'Lagrer …';
  try {
    await readResponse(await fetch('/api/pantry', {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    resetPantryForm();
    byId('pantry-message').textContent = 'Beholdningen er lagret for dere begge.';
    await loadPantry();
  } catch (error) {
    byId('pantry-message').textContent = error.message || 'Kunne ikke lagre';
    await loadPantry();
  } finally {
    pantryBusy = false;
    byId('pantry-form').querySelectorAll('input,select,button').forEach(element => { element.disabled = false; });
    renderPantry();
  }
}
function setupPantry() {
  byId('pantry-form').addEventListener('submit', event => void savePantry(event));
  byId('pantry-form').addEventListener('input', updatePantryFields);
  byId('pantry-form').addEventListener('change', updatePantryFields);
  byId('pantry-cancel').addEventListener('click', resetPantryForm);
  byId('pantry-refresh').addEventListener('click', () => void loadPantry());
  byId('pantry-list').addEventListener('click', event => { const button=event.target.closest('[data-edit-pantry]'); if (button) editPantry(Number(button.dataset.editPantry)); });
  updatePantryFields();
  void loadPantry();
}
