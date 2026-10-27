// Подсказки в поиске: пока человек печатает, под полем появляются подходящие статьи
const input = document.querySelector(".search input");
const list = document.getElementById("suggest-list");
let items = [];      // что сейчас показано
let active = -1;     // какой пункт выбран стрелками
let timer = null;
let lastQuery = "";

function close() {
  list.hidden = true;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  active = -1;
}

function render(query) {
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "suggest-empty";
    li.textContent = "Ничего не нашлось";
    list.append(li);
  }
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.id = "suggest-" + i;
    li.setAttribute("role", "option");
    const a = document.createElement("a");
    a.href = item.url;

    const pic = document.createElement("span");
    pic.className = "suggest-pic";
    if (item.image) {
      const img = document.createElement("img");
      img.className = "pic " + item.kind;
      img.src = item.image;
      img.alt = "";
      pic.append(img);
    } else {
      pic.textContent = item.emoji;
    }

    const text = document.createElement("span");
    text.className = "suggest-text";
    const title = document.createElement("b");
    title.textContent = item.title;
    const summary = document.createElement("small");
    summary.textContent = item.category + " · " + item.summary;
    text.append(title, summary);

    a.append(pic, text);
    li.append(a);
    list.append(li);
  });
  // Последний пункт — обычный поиск по всему тексту
  const all = document.createElement("li");
  all.className = "suggest-all";
  const link = document.createElement("a");
  link.href = input.form.action + "?q=" + encodeURIComponent(query);
  link.textContent = "Искать «" + query + "» во всех статьях →";
  all.append(link);
  list.append(all);

  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  active = -1;
}

// Поиск идёт прямо в браузере: все статьи лежат в одном файле search-index.json.
// Скачиваем его один раз, при первом поиске
let index = null;
function getIndex() {
  if (!index) index = fetch(input.dataset.indexUrl).then((r) => r.json());
  return index;
}

// Те же правила, что в articles.py: отрезаем окончание («айфоны» → «айфон»)…
function stem(word, data) {
  for (const ending of data.endings) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) return word.slice(0, -ending.length);
  }
  return word;
}

// …и меняем русское написание на название («айфон» → «iphone»), даже недописанное
function alias(word, data) {
  if (word in data.aliases) return data.aliases[word];
  if (word.length >= 3) {
    for (const key in data.aliases) if (key.startsWith(word)) return data.aliases[key];
  }
  return word;
}

function queryWords(query, data) {
  return query.toLowerCase().replaceAll("ё", "е").split(/\s+/).filter(Boolean).map((w) => alias(stem(w, data), data));
}

const plainTitle = (a) => a.title.toLowerCase().replaceAll("ё", "е");

// Статья подходит, если в ней есть все слова запроса. Выше те, где больше слов запроса есть в заголовке:
// на «айпод нано» сначала iPod nano, а потом остальные iPod
function searchArticles(query, data) {
  const words = queryWords(query, data);
  if (!words.length) return [];
  const results = data.articles.filter((a) => words.every((w) => a.text.includes(w)));
  const inTitle = (a) => words.filter((w) => plainTitle(a).includes(w)).length;
  return results.sort((a, b) => inTitle(b) - inTitle(a));
}

// Подсказки: выше статьи, где в названии больше слов запроса, затем точное совпадение и начало названия
function suggestArticles(query, data, limit = 8) {
  const words = queryWords(query, data);
  const rank = (a) => {
    const title = plainTitle(a);
    return [-words.filter((w) => title.includes(w)).length, title !== words.join(" "), !title.startsWith(words[0])];
  };
  const compare = (x, y) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  };
  return searchArticles(query, data).sort((a, b) => compare(rank(a), rank(b))).slice(0, limit);
}

async function load() {
  const query = input.value.trim();
  if (query.length < 2) { close(); return; }
  if (query === lastQuery && !list.hidden) return;
  lastQuery = query;
  try {
    const data = await getIndex();
    // Пока скачивали статьи, человек мог допечатать — старый запрос уже не нужен
    if (query !== input.value.trim()) return;
    items = suggestArticles(query, data);
    render(query);
  } catch (e) {
    close();
  }
}

// Страница поиска: запрос берём из адреса (?q=…) и рисуем все найденные статьи
async function showSearchPage(results) {
  const query = new URLSearchParams(location.search).get("q")?.trim() || "";
  const status = document.getElementById("search-status");
  input.value = query;
  if (!query) { status.textContent = "Введите запрос в поле поиска."; return; }
  document.getElementById("search-heading").textContent = "«" + query + "»";
  document.title = "Поиск: " + query + " — Энциклопедия Apple";
  const found = searchArticles(query, await getIndex());
  status.textContent = found.length ? "Найдено статей: " + found.length : "Ничего не нашлось. Попробуйте другое слово.";
  for (const a of found) {
    const li = document.createElement("li");
    const thumb = document.createElement("span");
    thumb.className = "thumb small";
    if (a.image) {
      const img = document.createElement("img");
      img.className = "pic " + a.kind + (a.logo ? " logo" : "");
      img.src = a.image;
      img.alt = a.title;
      thumb.append(img);
    } else {
      thumb.textContent = a.emoji;
    }
    const div = document.createElement("div");
    const link = document.createElement("a");
    link.className = "result-title";
    link.href = a.url;
    link.textContent = a.title;
    const summary = document.createElement("p");
    summary.textContent = a.summary;
    const category = document.createElement("span");
    category.className = "muted";
    category.textContent = a.category;
    div.append(link, summary, category);
    li.append(thumb, div);
    results.append(li);
  }
}
const searchResults = document.getElementById("search-results");
if (searchResults) showSearchPage(searchResults);

function highlight(i) {
  const options = list.querySelectorAll("[role=option]");
  options.forEach((el) => el.classList.remove("active"));
  active = i;
  if (i >= 0) {
    options[i].classList.add("active");
    options[i].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", options[i].id);
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}

// Ждём 150 мс после последней буквы, чтобы не искать заново на каждое нажатие
input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(load, 150);
});

input.addEventListener("keydown", (e) => {
  if (list.hidden) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlight(Math.min(active + 1, items.length - 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlight(Math.max(active - 1, -1));
  } else if (e.key === "Enter" && active >= 0) {
    e.preventDefault();
    location.href = items[active].url;
  } else if (e.key === "Escape") {
    close();
  }
});

input.addEventListener("focus", () => {
  if (input.value.trim().length >= 2 && items.length) list.hidden = false;
});

// Клик мимо поля и списка закрывает подсказки
document.addEventListener("click", (e) => {
  if (!input.form.contains(e.target)) close();
});
