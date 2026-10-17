# Pantalla TV

Página de inicio para el TV del living: noticias en vivo, reloj, clima de Santiago y titulares.

- **Página:** `index.html`, publicada con GitHub Pages en https://jeffstgo.github.io/tv-pantalla/
- **Datos:** `data/headlines.json` (La Tercera, Cooperativa, BBC Mundo y CIPER) y `data/live.json` (primer canal en vivo entre CNN Chile, CNN en Español, T13, France 24 Español y DW Español).
- **Actualización:** `.github/workflows/update.yml` corre `scripts/update.mjs` cada 30 minutos y guarda los cambios.
- **Clima:** se consulta directo desde la página a [Open-Meteo](https://open-meteo.com/), sin clave.

Para probar en el PC con los datos locales: servir la carpeta y abrir `index.html?data=./data/`.
