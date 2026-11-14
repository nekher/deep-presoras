# Deep presoras — Contexto del proyecto

Documento único de contexto. Reemplaza a cualquier otro `PROYECTO.md`,
`ARQUITECTURA.md`, `ESTADO.md` o `PROMPT-INICIO.md` previo.

---

## Qué es

Aplicación web **local** para monitorear contadores de páginas de impresoras
Lexmark en un edificio de oficinas. Toma los contadores vía SNMP v2c, los
acumula por mes y muestra deltas para estadísticas de consumo de papel y tóner.

- **Nombre**: Deep presoras (juego de palabras: DeepSeek + impresoras + depresivas).
- **Autor**: Nicolás Maximiliano Rodriguez Digon (@nekher en GitHub).
- **Uso**: un operador por instancia, corre en la PC del operador. Varias
  instancias pueden coordinarse vía lock file en carpeta de red compartida
  (1 editor + N viewers simultáneos).
- **Estado**: funcional, en uso interno. Pensado para uso personal / equipos chicos.

---

## Cómo empezar (para quien clona el repo)

1. Requisitos: **Node.js v18+** y **PowerShell 5.1** (viene con Windows 10/11).
2. Copiar los mocks a sus nombres reales:
   - `impresoras.mock.json` → `impresoras.json`
   - `historico.mock.json` → `historico.json`
   - `meta.mock.json` → `meta.json`
3. Editar `impresoras.json` con las IPs y seriales de tus impresoras. O usar la
   UI para agregarlas una vez que el server esté levantado.
4. Doble click en `start.bat`. Se abre `http://localhost:8080`.
5. Ajustar `LEGACY_HASTA` en `app.js` si tu "corte legacy" es distinto a
   `'2026-10'`. Es la línea 8 del archivo.
6. Correr el primer scan desde el botón "Actualizar ahora". Va a tardar
   ~1 minuto por cada 100 impresoras.

---

## Stack

- **Backend**: Node.js (v18+), **solo módulos nativos** (`http`, `fs`, `path`,
  `os`, `child_process`). Sin dependencias externas.
- **Scanner SNMP**: PowerShell 5.1 (`monitor.ps1`). Implementación de BER a mano.
  **No tocar la lógica BER/SNMP.**
- **Frontend**: HTML5 + CSS3 + JS vanilla (ES2020+). Sin bundler, sin frameworks.
- **Tema**: light/dark con CSS variables y `data-theme` en `<html>`.

---

## Estructura de archivos

```text
deep-presoras/
├── index.html        # UI: 5 vistas principales + modal edición + modal inactividad
├── app.js            # toda la lógica del frontend
├── styles.css        # estilos + tema + glassmorphism
├── server.js         # servidor Node: API + static + lock editor/viewer
├── monitor.ps1       # SNMP scanner (NO TOCAR la lógica SNMP)
├── start.bat         # arranca Node + abre navegador
├── impresoras.json   # config de impresoras (CRUD desde UI)
├── historico.json    # lecturas mensuales por impresora
├── meta.json         # timestamp del último scan
├── _lock.json        # (se genera solo) lock editor/viewer en la carpeta compartida
└── PROYECTO.md       # este archivo
```

`impresoras.json`, `historico.json`, `meta.json` y `_lock.json` son archivos de
datos. **No van en el repo público**. El repo incluye versiones de ejemplo
(`*.mock.json`) para que quien clone tenga con qué arrancar.

---

## .gitignore sugerido

```text
impresoras.json
historico.json
meta.json
_lock.json
node_modules/
*.bak
```

---

## Vistas de la app

1. **Tablero**: 5 stats en cards (hojas históricas, hojas este mes con proyección
   y comparación vs mes anterior, impresora top, peor mes, piso más abusador),
   donut de estado general, top 5 del mes, tendencia mensual (6 meses con
   proyección), donut por modelo clickeable (panel con detalle), top 5 histórico,
   impresoras por edificio, impresoras por piso, impresoras por funcionario,
   consumo por edificio, hojas por funcionario (rolling 3 meses), y dos secciones
   colapsables ("Impresoras OK" y "Impresoras con problemas"). Botón "Compartir"
   (exporta el dashboard como HTML standalone).

2. **Lista de Impresoras**: dos niveles.
   - Nivel 1: grid de cards por edificio (icono SVG, color, conteo).
   - Nivel 2: tabla de impresoras del edificio, con columnas: IP/Serial,
     Modelo, Área, Piso, Funcionario, Contador inicial, Estado, Total (+ suma
     del edificio en el header), Última respuesta, Acciones. Click en fila → DNI.
   - Botones:
     - **Exportar PDF** → dropdown con 2 opciones: "Lista de impresoras"
       (reporte de consumo clásico) o "Dashboard completo" (mismo contenido
       que el botón Compartir, impreso a PDF).
     - **Realizar backup** → dropdown con 3 opciones: "Backup total" (2 CSV),
       "Solo lista de impresoras" (1 CSV), "Solo histórico" (1 CSV). Muestra
       badge si el último backup fue hace mucho.
   - Sección colapsable "Impresoras borradas" (soft delete con revive).

3. **Buscador**: filtros (texto libre, edificio, piso, estado). Lista única de
   impresoras que matchean. Click en fila → DNI.

4. **DNI de impresora**: vista generada on-the-fly. Placeholder de imagen +
   modelo grande + badge de estado + botón editar. Grid de datos (modelo, marca,
   equipamiento, funcionario, piso, edificio, escaneable, contador inicial,
   última respuesta, hojas este mes, total histórico, última lectura). Tabla de
   histórico mes a mes (raws crudos en legacy, deltas en confiables, deltas
   manuales si existen).

5. **Históricos**: tabla con 1 fila por impresora, columnas = meses (más nuevo
   a la izquierda) + columna Total. Los meses legacy tienen fondo rayado y ⚠.
   Serial clickeable → DNI.

---

## Modelo de datos

### impresoras.json

```json
{
  "impresoras": [
    {
      "serial": "ABC123456789",
      "ip": "192.168.1.100",
      "piso": "PB",
      "area": "ADMINISTRACION",
      "funcionario": "JUAN PEREZ",
      "modelo": "MB2546",
      "marca": "LEXMARK",
      "equipamiento": "MULTIFUNCION",
      "edificio": "Sede Central",
      "escanear": true,
      "baseline": { "mes": "2026-10", "raw": 61418 },
      "borradaEn": "2026-11-13T10:00:00.000Z"
    }
  ]
}
```

Notas:
- `serial` es clave primaria (fallback a `ip`).
- `ip` puede estar duplicada o ser `"USB"`.
- `piso` es string libre (`"PB"`, `"13"`, `"15"`, `"-1"`). `pisoLabel()` lo
  formatea: `-1` → SS, `0` → PB, `N` → PN.
- `edificio` es string libre. Vacío = "Sin edificio" (agrupado aparte).
- `escanear`: si es `false`, `monitor.ps1` la omite. Default `true`.
- `baseline`: opcional. Punto de partida del conteo. Bloqueado en la UI con
  candado, solo se desbloquea con confirm de advertencia.
- `borradaEn`: si está presente, la impresora está "borrada" (soft delete).
  No cuenta para totales. Se revive eliminando este campo.

### historico.json

```json
{
  "registros": {
    "ABC123456789": {
      "meses": {
        "2026-03": 48184,
        "2026-10": 61418,
        "2026-11": 62277
      },
      "deltasManuales": {},
      "ultimoIntento": "2026-11-13T17:30:07.893-03:00",
      "ultimaRespuesta": "2026-11-13T17:30:08.312-03:00",
      "ultimoEstado": "ok"
    }
  }
}
```

Notas:
- Clave por `serial` (fallback a `ip`).
- `meses` son lecturas crudas (raw) del contador, formato `YYYY-MM`.
- `deltasManuales` son overrides del delta calculado. Útiles para corregir el
  efecto de un reset de contador (cambio de tóner, reemplazo de placa) sin
  tocar los raws. Si existen, tienen prioridad sobre el delta calculado.
  **Se preservan entre scans** (ver `monitor.ps1`).
- `ultimoEstado` puede ser `"ok"`, `"error"`, `"usb"`.

### meta.json

```json
{
  "ultimaActualizacion": "2026-11-13T17:30:15.073-03:00",
  "ultimaDuracion": 17,
  "totalImpresoras": 95,
  "responden": 79,
  "sinRespuesta": 10
}
```

### _lock.json (se genera solo, no se versiona)

```json
{
  "hostname": "PC-OPERADOR",
  "pid": 1234,
  "timestamp": 1731600000000,
  "nota": "🚽 Ocupado — no usar"
}
```

---

## Reglas de oro

1. **No tocar la lógica BER/SNMP de `monitor.ps1`**. Funciona. Si hay que
   modificar el script, es solo la parte de filtro de qué impresoras escanear
   (ya tiene el filtro `borradaEn` y `escanear`) o la preservación de campos
   del JSON.
2. **Legacy = no confiable**. `LEGACY_HASTA = '2026-10'`. Todo mes `<= 2026-10`
   se muestra como raw crudo rayado, **no calcula delta, no suma al total**.
3. **`>= 2026-11` es confiable**.
4. **No inventar datos**. Los datos legacy que haya en el JSON son la fuente de
   verdad. No corregir, no reordenar.
5. **Sin frameworks**. Solo vanilla JS, HTML, CSS.
6. **No usar librerías externas** en el backend. Solo módulos nativos de Node.
7. **Cada cambio se prueba en el navegador** con F12 → consola antes de dar por
   cerrado.
8. **Cuando se entrega código**: archivos completos, no fragmentos, salvo
   cambio muy puntual claramente identificado con bloque ANTES/DESPUÉS.
9. **El modal solo modifica lo que el usuario cambió**: baseline (si lo
   desbloqueó y editó), contador del mes actual (si es editable), contador del
   mes anterior (si expandió el link). El resto del histórico NO se toca. El
   guardado hace merge, no reemplazo.
10. **El baseline no se puede borrar desde la UI**, solo cambiar. Si el usuario
    desbloquea y deja vacío, se ignora (toast avisando).
11. **Si la impresora responde al SNMP (estado "ok"), el campo de lectura actual
    es readonly**. El dato del sensor tiene prioridad sobre cualquier valor
    manual.

---

## Lógica de cálculo (frontend)

```text
getDelta(printer, mesKey):
  if esLegacy(mesKey): return null
  if hay deltaManual[mesKey]: return ese valor
  raw = getRaw(printer, mesKey)
  if raw == null: return null
  prev = getPrevRaw(printer, mesKey)  // mes más reciente < mesKey con raw, o baseline
  if !prev: return null
  return max(0, raw - prev.raw)

getTotalDelta(printer):
  suma de getDelta(printer, m) para todos los m donde no esLegacy(m)

getPrevRaw(printer, mesKey):
  busca el mes más reciente < mesKey con raw en historico.meses
  si no hay, busca baseline (si baseline.mes < mesKey)
  devuelve el que sea más reciente de los dos

getBaseline(printer):
  si printer.baseline tiene mes y raw válidos, devuelve {mes, raw}
  si no, null

getEstado(key):
  "ok"    si ultimoEstado === "ok"
  "usb"   si ultimoEstado === "usb"
  "error" en cualquier otro caso

esEscanable(printer):
  false si ip es "USB"
  false si escanear === false
  true en cualquier otro caso

proyectarMes(mesKey):
  si mesKey es el mes calendario actual:
    proyectado = totalActual / diasTranscurridos * diasDelMes
    devuelve { total, proyectado, dias, diasTotal }
  si no: null
```

**Auto-baseline**: en `loadData()`, si una impresora no tiene `baseline`
explícito **y no tiene ningún mes legacy** en su histórico, se crea
automáticamente un baseline con el mes más viejo con raw. Esto es para
impresoras nuevas que empiezan a escanear en el mes confiable o después.
**No se dispara para las impresoras con histórico legacy**, porque ya tienen
un punto de partida claro.

**Precisión de los deltas**: los deltas de **noviembre 2026** son
**aproximados** (baseline de octubre vs primer scan de noviembre — el scan de
noviembre no cae exactamente el 1ro del mes, así que puede incluir días de
octubre o faltarle días de noviembre). Desde **diciembre 2026 en adelante** son
**exactos**: diferencia entre dos scans SNMP consecutivos, ambos hechos dentro
del mes correspondiente.

---

## Sistema de lock editor / viewer

La app puede correr en varias PCs simultáneas apuntando a los mismos JSONs en
una carpeta de red compartida. Para evitar que dos personas editen a la vez y
se pisen los datos, hay un **lock file** en la misma carpeta:

- **Al arrancar `server.js`**: intenta tomar el lock (`_lock.json`).
  - Si no existe o está stale (>120s sin heartbeat): lo toma → **modo editor**.
  - Si existe y está fresco: queda como **viewer**.
- **Heartbeat**: el frontend envía `POST /api/heartbeat` cada 30s mientras sos
  editor. Renueva el `timestamp` del lock.
- **Timeout**: si pasan 120s sin heartbeat, cualquier otra instancia puede
  tomar el lock como stale.
- **Escrituras protegidas**: `POST /api/impresoras`, `POST /api/historico`,
  `POST /api/scan` requieren ser editor. Los viewers reciben `403`.
- **Botón "Cerrar sesión"** (solo editor): libera el lock al instante y hace
  `process.exit(0)` del server.
- **Inactividad del editor**: a los 15 min sin input, aparece modal "¿Seguís
  ahí?" con countdown de 60s. Si no confirma, se libera el lock y pasa a viewer.
- **Viewer puede tomar edición** cuando el lock está libre: botón "Tomar
  edición" en el banner superior.

**UI**:
- Badge `🟢 Editando` o `⚪ Solo lectura` en el sidebar.
- Banner superior para viewer: "El programa está siendo utilizado por otra
  persona" o "Nadie está editando. [Tomar edición]".
- Botones de edición/scan ocultos para viewer.

**Modelo mental para el usuario**: "Es como el Excel que ya usás. Si alguien lo
tiene abierto, el otro entra en modo lectura."

---

## API del server (`server.js`)

- `GET /api/datos` → `{ impresoras, registros, meta, isEditor, lockOwner }`
- `GET /api/lock` → `{ isEditor, lockOwner, isStale }`
- `POST /api/heartbeat` → renueva el lock (solo editor)
- `POST /api/take-edit` → intenta tomar el lock en caliente
- `POST /api/logout` → libera lock + opcional `process.exit`
- `POST /api/impresoras` → body `{ impresoras: [...] }` (solo editor)
- `POST /api/historico` → body `{ key, meses, deltasManuales }` (solo editor).
  Reemplaza el registro entero.
- `POST /api/scan` → dispara `monitor.ps1`, espera, devuelve
  `{ ok, duracion, output }` (solo editor)
- `GET /*` → sirve archivos estáticos

**Puerto**: `8080`, bind a `127.0.0.1`. **No exponer a la red** — la seguridad
se delega en los permisos de carpeta del sistema operativo (mismo modelo que el
Excel compartido).

---

## OID SNMP

- Lexmark page counter: `.1.3.6.1.4.1.641.6.4.2.4.1.3.1.1`
- Community: `public`
- Timeout: 1000ms, sin reintentos, puerto 161 UDP

---

## Cosmética y UX

- **Glassmorphism** en cards, sidebar, modal, toasts.
- **Gradiente animado de fondo** en `body::before` (45s, muy lento).
- **Count-up** en los 5 stats del tablero al cargar.
- **Pulse** en badges que cambian (`countOk`, `countProblemas`, `countBorradas`).
- **Easter egg**: 8 clicks rápidos en el kraken del sidebar → fueguito + abre
  `https://github.com/nekher`.
- **Kraken** como icono de la app (SVG inline, en el favicon y en el sidebar).
- **Botón de tema** claro/oscuro, persistido en `localStorage`.
- **Botón de GitHub** en el sidebar, linkea a @nekher.

## Highlights / características

- **Cero dependencias**. Todo corre con Node nativo + PowerShell 5.1.
- **Deltas exactos** entre scans desde el mes confiable. Legacy se muestra
  crudo y no contamina la estadística.
- **Multi-instancia coordinada**: varios usuarios pueden ver simultáneamente
  (viewers ilimitados) con un solo editor a la vez. Sin base de datos, sin
  servidor centralizado, sin login.
- **Sin login, sin base de datos, sin servidor**. Solo archivos compartidos en
  red y un lock file. La seguridad se delega 100% en los permisos del sistema
  operativo, igual que el Excel que reemplaza.
- **Exportación múltiple**: PDF (reporte clásico o dashboard completo), HTML
  standalone (para compartir por WhatsApp o mail), CSV (backup total o parcial).
- **Backup con recordatorio**: badge en el botón avisa si pasó mucho tiempo
  desde el último backup.
- **Soft delete**: las impresoras borradas conservan sus datos y pueden
  revivirse.
- **Legacy visualmente distinguido**: fondo rayado y ⚠ en la UI, para que nadie
  confunda datos viejos con actuales.

---

## Decisiones de diseño tomadas

- **Serial como clave primaria**, fallback a IP. Permite manejar IPs duplicadas.
- **Legacy cut fijo en `2026-10`**. No se mueve con el tiempo.
- **Piso es string libre**. `pisoLabel()` lo formatea.
- **Edificio es string libre**. Sin normalización. Aceptado: "no necesitamos
  lógica super segura, solo un campo extra".
- **Soft delete**: borrar = mover a "Impresoras borradas", no elimina datos.
  Revivir = volver al ruedo. El monitor **no escanea** borradas.
- **Delta manual**: override del delta calculado. No se edita desde la UI hoy,
  pero si existe en el JSON se aplica. Se preserva entre scans.
- **Baseline con candado**: si tiene baseline, se muestra bloqueado. Para
  editarlo hay que desbloquear con confirm de advertencia.
- **Impresora OK**: el campo de lectura actual es `readonly`. El dato del sensor
  manda.
- **Auto-baseline**: se crea solo para impresoras nuevas (sin legacy) en el
  primer load.
- **Modal hace merge, no reemplazo**. Solo modifica lo que el usuario tocó.
- **Lista de impresoras en 2 niveles**: edificios → tabla del edificio.
- **Compartir dashboard**: exporta un HTML standalone autocontenido (CSS
  inline, sin JS, sin dependencias). Sirve para mandar por chat/mail.
- **Lock editor/viewer sin login**: sin usuarios ni passwords. El primero que
  abre el `.bat` es editor; los demás son viewers. El editor se libera por
  logout o inactividad.
- **Seguridad = permisos de carpeta del SO**. La app corre en `127.0.0.1`, no
  expone puertos. Quien no tiene acceso al share, no ve nada. Mismo modelo que
  el Excel que reemplaza.

---

## Restricciones importantes

- **No tocar la lógica BER/SNMP de `monitor.ps1`**. Sí se puede tocar el filtro
  de qué impresoras escanear (ya tiene `borradaEn` y `escanear`) y la
  preservación de campos del JSON.
- **No inventar datos**. Los legacy son "dios" para lo que tienen.
- **No usar frameworks** (React, Vue, etc.).
- **No usar librerías externas** en el backend (solo módulos nativos de Node).
- **Preferir soluciones simples y verificables**.
- **Cuando se entrega código**: archivos completos por archivo, no fragmentos,
  salvo cambio muy puntual claramente identificado con bloque ANTES/DESPUÉS.
- **Al terminar un cambio**: incluir cómo probarlo paso a paso.
- **No exponer a `0.0.0.0`**. La seguridad se delega en permisos del SO.

---

## Lo que está pendiente / próximos pasos

### Operativos (no código)

- **Backup automático** vía Task Scheduler de Windows (un `.bat` que copie los
  JSONs a otra carpeta cada hora).
- **Deploy en segunda PC**: cada operador tiene su propia instancia apuntando al
  share. Ya soportado por el lock. Si se necesita "servidor central", evaluar
  `0.0.0.0` + login real (no trivial, no recomendado en redes no confiables).
- **README para GitHub** + `.gitignore` + JSONs mock con datos ficticios.

### Mejoras posibles (baja prioridad)

- **Login real con usuarios** (`usuarios.json` con hashes scrypt). Solo tiene
  sentido si la app se monta en una PC compartida / expuesta. Hoy el lock cubre
  el caso de uso.
- **Deltas manuales editables desde la UI**. Hoy existen en el modelo pero no
  hay pantalla para cargarlos. Se cargan editando el JSON a mano.
- **Bloqueo del modal durante scan**. Si el editor lanza un scan y en esos 16s
  edita una impresora, el scan puede pisar la edición. Caso raro pero real.
- **Ratio hojas por impresora** por piso / edificio. Métrica operativa que
  detecta ineficiencia.
- **Costo estimado**. Requiere config de costo por hoja / tóner.
- **Alertas** de impresoras caídas hace >N días. Hoy están en el colapsable de
  "con problemas" pero no son alertas activas.

### Descartado

- **Docker**: la combinación Node + PowerShell 5.1 + SNMP + Windows containers
  es frágil. No vale la pena.
- **Ofuscación / empaquetado a `.exe`**: no aportan seguridad real.
- **Base de datos**: los JSONs alcanzan para cientos de impresoras.
- **`.vbs` para lanzar sin ventana**: bloqueado frecuentemente por GPO, AV, o
  Mark of the Web. El `.bat` visible funciona y es más predecible.

---

## Sobre los mocks

Los archivos `*.mock.json` del repo son ficticios: seriales inventados, IPs de
laboratorio (`192.168.1.x`), nombres genéricos. Están pensados para:

- Que la app se pueda probar apenas clonada sin tener que armar un JSON a mano.
- Ver todos los estados posibles: 1 impresora USB, 1 caída hace meses (para el
  estado `error`), 1 con soft delete activo, variedad de modelos.
- Tener 8 meses legacy + 1 mes confiable, para ver el corte visual de la tabla
  de históricos.

Si publicás el proyecto con datos reales, **no commitees los `.json` reales**.
Dejalos en `.gitignore`.

---

## Contexto humano (para quien clone el repo)

- **Fecha "actual" del proyecto**: noviembre de 2026.
- Los 5 stats del tablero ("hojas históricas" y "hojas este mes") van a dar
  **el mismo número** hasta fin de año, porque noviembre es el único mes
  confiable del año. Esto no es bug, es matemática. A partir de enero 2027
  divergen.
- El proyecto original era un script PowerShell + Excel. Migró a Node + web
  para tener UI moderna. El legacy viene de ese Excel y tiene problemas
  conocidos (contadores que bajan, textos sueltos, IPs duplicadas).
- El corte legacy es fijo (`2026-10`). Si alguien clona el repo y quiere
  adaptarlo a su propia realidad, tiene que ajustar `LEGACY_HASTA` en `app.js`
  y reemplazar los JSONs. Si su proyecto no tiene "legacy" (arranca limpio
  desde cero), puede poner `LEGACY_HASTA = ''` y todo el histórico se calcula
  como delta entre scans consecutivos.