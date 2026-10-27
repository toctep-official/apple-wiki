"""Собирает сайт в обычные HTML-файлы для GitHub Pages — папка _site/.

Flask рисует каждую страницу так же, как при обычном запуске, а мы сохраняем результат в файл.
Запуск: venv/bin/python build.py
Адрес сайта на Pages — https://toctep-official.github.io/apple-wiki/, поэтому все ссылки начинаются с /apple-wiki/.
"""
import shutil
import subprocess
from pathlib import Path

from app import app
from articles import ARTICLES, CATEGORIES

BASE = "http://localhost/apple-wiki/"
OUT = Path(__file__).parent / "_site"


def save(path, file):
    response = client.get(path, base_url=BASE)
    if response.status_code not in (200, 404):
        raise SystemExit(f"{path}: ответ {response.status_code}")
    target = OUT / file
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.data)


if OUT.exists():
    shutil.rmtree(OUT)
client = app.test_client()

# GitHub Pages открывает /article/iphone-15 из файла article/iphone-15.html
save("/", "index.html")
save("/timeline", "timeline.html")
save("/search", "search.html")
save("/random", "random.html")
save("/search-index.json", "search-index.json")
save("/такой-страницы-нет", "404.html")
for key in CATEGORIES:
    save(f"/category/{key}", f"category/{key}.html")
for a in ARTICLES:
    save(f"/article/{a['slug']}", f"article/{a['slug']}.html")

# Картинки, стили и скрипты — только те, что лежат в git (старые фото Apple туда не попадают)
static = subprocess.run(["git", "ls-files", "static"], capture_output=True, text=True, check=True).stdout.split()
for file in static:
    target = OUT / file
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(file, target)

# Без этого файла GitHub Pages пропускает сайт через Jekyll, а он нам не нужен
(OUT / ".nojekyll").touch()
print(f"Готово: {len(ARTICLES)} статей, {len(static)} файлов из static → {OUT}")
