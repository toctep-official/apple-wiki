// Увеличение картинок в статье: клик по фото открывает его крупно поверх страницы
const images = document.querySelectorAll(".infobox-image img, .gallery img");

function open(img) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", img.alt);

  const big = document.createElement("img");
  big.src = img.src;
  big.alt = img.alt;

  const close = document.createElement("button");
  close.className = "lightbox-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Закрыть");

  overlay.append(big, close);
  document.body.append(overlay);
  document.body.classList.add("lightbox-open");
  close.focus();

  function hide() {
    overlay.remove();
    document.body.classList.remove("lightbox-open");
    document.removeEventListener("keydown", onKey);
    img.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") hide();
  }
  // Закрывается кликом в любом месте, крестиком или клавишей Esc
  overlay.addEventListener("click", hide);
  document.addEventListener("keydown", onKey);
}

images.forEach((img) => {
  // Картинку можно открыть и с клавиатуры: Tab до неё и Enter
  img.tabIndex = 0;
  img.setAttribute("role", "button");
  img.title = "Нажмите, чтобы увеличить";
  img.addEventListener("click", () => open(img));
  img.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(img);
    }
  });
});
