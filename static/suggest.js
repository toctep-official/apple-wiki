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

async function load() {
  const query = input.value.trim();
  if (query.length < 2) { close(); return; }
  if (query === lastQuery && !list.hidden) return;
  lastQuery = query;
  try {
    const response = await fetch(input.dataset.suggestUrl + "?q=" + encodeURIComponent(query));
    const data = await response.json();
    // Пока ждали ответ, человек мог допечатать — старый ответ уже не нужен
    if (query !== input.value.trim()) return;
    items = data;
    render(query);
  } catch (e) {
    close();
  }
}

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

// Ждём 150 мс после последней буквы, чтобы не спрашивать сервер на каждое нажатие
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
