// Настройки Liquid Glass, как в «Экран и яркость» на iPhone: прозрачность стекла,
// размытие и оттенок. Подключается в <head> без defer, чтобы сохранённые настройки
// применились до отрисовки страницы и стекло не «мигало» при загрузке
(function () {
  const root = document.documentElement;
  const DEFAULTS = { style: "standard", blur: 28, tint: "none" };

  // Насколько плотное стекло в каждом режиме (множитель непрозрачности)
  const STYLES = { clear: 0.55, standard: 1, tinted: 1.5 };
  const STYLE_NAMES = { clear: "Прозрачное", standard: "Стандартное", tinted: "Тонированное" };

  // Системные цвета Apple
  const TINTS = {
    none: null,
    blue: [10, 132, 255],
    purple: [191, 90, 242],
    pink: [255, 55, 95],
    orange: [255, 159, 10],
    green: [48, 209, 88],
    graphite: [142, 142, 147],
  };
  const TINT_NAMES = {
    none: "Без оттенка", blue: "Синий", purple: "Фиолетовый", pink: "Розовый",
    orange: "Оранжевый", green: "Зелёный", graphite: "Графит",
  };

  // Цвет стекла без оттенка — такой же, как в style.css
  const BASE = {
    light: { glass: [255, 255, 255], strong: [255, 255, 255], inner: [255, 255, 255] },
    dark: { glass: [28, 30, 38], strong: [34, 37, 46], inner: [255, 255, 255] },
  };

  function load() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem("glass") || "{}"));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save(settings) {
    try { localStorage.setItem("glass", JSON.stringify(settings)); } catch (e) {}
  }

  // Подмешиваем к цвету стекла немного оттенка
  function mix(base, tint, amount) {
    return base.map((c, i) => Math.round(c + (tint[i] - c) * amount)).join(" ");
  }

  function apply(settings) {
    root.style.setProperty("--glass-k", STYLES[settings.style] || 1);
    root.style.setProperty("--blur-px", settings.blur + "px");
    const tint = TINTS[settings.tint];
    const dark = root.dataset.theme === "dark";
    const base = BASE[dark ? "dark" : "light"];
    for (const [part, amount] of [["glass", 0.22], ["strong", 0.16], ["inner", dark ? 0.5 : 0.18]]) {
      const name = part === "glass" ? "--glass-rgb" : "--glass-" + part + "-rgb";
      if (tint) root.style.setProperty(name, mix(base[part], tint, dark ? amount + 0.1 : amount));
      else root.style.removeProperty(name);
    }
  }

  let settings = load();
  apply(settings);

  // Тема переключилась — пересчитываем оттенок под светлое или тёмное стекло
  new MutationObserver(() => apply(settings)).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // Панель с настройками строим, когда страница загрузилась
  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("glass-toggle");
    if (!button) return;

    const panel = document.createElement("div");
    panel.className = "glass-panel";
    panel.id = "glass-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Настройки Liquid Glass");
    panel.hidden = true;
    panel.innerHTML = `
      <h3>Liquid Glass</h3>
      <p class="glass-label">Стекло</p>
      <div class="glass-segments" role="radiogroup" aria-label="Стекло">
        ${Object.keys(STYLES).map((key) =>
          `<button type="button" role="radio" data-style="${key}">${STYLE_NAMES[key]}</button>`).join("")}
      </div>
      <label class="glass-label" for="glass-blur">Размытие <span id="glass-blur-value"></span></label>
      <input type="range" id="glass-blur" min="0" max="40" step="1">
      <p class="glass-label">Оттенок</p>
      <div class="glass-swatches" role="radiogroup" aria-label="Оттенок">
        ${Object.keys(TINTS).map((key) => {
          const color = TINTS[key] ? `rgb(${TINTS[key].join(",")})` : "transparent";
          return `<button type="button" role="radio" data-tint="${key}" title="${TINT_NAMES[key]}"
                  aria-label="${TINT_NAMES[key]}" style="--swatch:${color}"></button>`;
        }).join("")}
      </div>
      <button type="button" class="glass-reset">Сбросить</button>`;
    document.body.append(panel);

    const blur = panel.querySelector("#glass-blur");
    const blurValue = panel.querySelector("#glass-blur-value");

    // Показываем в панели, что сейчас выбрано
    function refresh() {
      panel.querySelectorAll("[data-style]").forEach((b) =>
        b.setAttribute("aria-checked", String(b.dataset.style === settings.style)));
      panel.querySelectorAll("[data-tint]").forEach((b) =>
        b.setAttribute("aria-checked", String(b.dataset.tint === settings.tint)));
      blur.value = settings.blur;
      blurValue.textContent = settings.blur;
    }

    function update(change) {
      settings = Object.assign({}, settings, change);
      apply(settings);
      save(settings);
      refresh();
    }

    panel.addEventListener("click", (e) => {
      const target = e.target.closest("button");
      if (!target) return;
      if (target.dataset.style) update({ style: target.dataset.style });
      else if (target.dataset.tint) update({ tint: target.dataset.tint });
      else if (target.classList.contains("glass-reset")) update(DEFAULTS);
    });
    blur.addEventListener("input", () => update({ blur: Number(blur.value) }));

    function toggle(open) {
      panel.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      if (open) {
        refresh();
        panel.querySelector("[aria-checked=true]")?.focus();
      }
    }
    button.setAttribute("aria-controls", "glass-panel");
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle(panel.hidden);
    });
    // Закрывается кликом мимо панели и клавишей Esc
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target)) toggle(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) {
        toggle(false);
        button.focus();
      }
    });
  });
})();
