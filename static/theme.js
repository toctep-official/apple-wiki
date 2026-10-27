// Кнопка переключения светлой и тёмной темы
const root = document.documentElement;
const button = document.getElementById("theme-toggle");
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function savedTheme() {
  try { return localStorage.getItem("theme"); } catch (e) { return null; }
}

// Иконка показывает, на какую тему переключит кнопка
function updateButton() {
  const dark = root.dataset.theme === "dark";
  button.textContent = dark ? "☀️" : "🌙";
  button.title = dark ? "Светлая тема" : "Тёмная тема";
  button.setAttribute("aria-label", button.title);
}

button.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  updateButton();
});

// Пока тему не выбрали вручную, следуем за системой, даже если она переключилась при открытой странице
systemDark.addEventListener("change", (event) => {
  if (!savedTheme()) {
    root.dataset.theme = event.matches ? "dark" : "light";
    updateButton();
  }
});

updateButton();
