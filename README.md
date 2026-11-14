# Deep presoras

Monitor local de contadores de páginas para impresoras Lexmark vía SNMP v2c.

- Backend Node.js sin dependencias.
- Scanner SNMP en PowerShell 5.1.
- Frontend vanilla (HTML + CSS + JS).
- Coordinación multi-usuario vía lock file en carpeta de red.

## Cómo empezar

1. Cloná el repo.
2. Copiá los mocks:
   - `impresoras.mock.json` → `impresoras.json`
   - `historico.mock.json` → `historico.json`
   - `meta.mock.json` → `meta.json`
3. Editá `impresoras.json` con tus IPs y seriales.
4. Doble click en `start.bat`.

Ver [`project.md`](./project.md) para el contexto completo del proyecto.
