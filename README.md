# Quiron

Historia clínica, recetas y órdenes de estudios para consultorio. App de
escritorio, un solo profesional, datos **cifrados en disco**, y lo que sale
impreso se firma **a mano** sobre el papel: no hay firma electrónica ni nada
que dependa de un servicio de nadie.

Se llamó **Rx** hasta la 0.1.12 y **Quirotech** de la 0.2.0 a la 0.2.6. El
nombre viene de Quirón, el centauro que le enseñó medicina a Asclepio; el ícono
es la vara de este último. Por dentro muchas cosas siguen diciendo `rx` (el
prefijo de las clases propias, el puente `window.rx`, el archivo `rx.db`) o
`qt` (`quirotech.css` y sus variables `--qt-`), y está bien que así sea. La
carpeta de datos fue `%APPDATA%\Rx` hasta la 0.2.3 y `%APPDATA%\Quirotech`
hasta la 0.2.6: ver «La mudanza de los datos», más abajo.

Construida sobre [Opal](../Opal), la plantilla de vidrio (hasta la 0.1.12 fue
Onyx). Todo lo que dice el README de Opal sobre el shell, los tokens, las hojas
y el anti-flash vale acá; esto documenta lo que Quiron agrega encima.

```
npm run dev            # con la consola del renderer saliendo por la terminal
npm test               # tokens, almacenamiento y formato (node pelado)
npm run test:datos     # la base cifrada de punta a punta (necesita Electron)
npm run test:compat    # una base hecha por la librería vieja abre con la de ahora
npm run humo           # monta la app, la desbloquea y la recorre entera

npm run icon           # regenera el ícono en todos sus tamaños (build/icono.mjs)
npm run build          # instalador NSIS en dist/
npm run test:paquete   # verifica el build: el .exe de verdad, no el fuente
```

---

## Lo que protege, y lo que no

La base entera está cifrada con **SQLCipher**: página por página, no "los
campos sensibles". En una historia clínica el nombre del paciente al lado de un
diagnóstico ya *es* el dato sensible, así que se cifra todo o no sirve de nada.

La clave sale de la contraseña por **scrypt** (N=2¹⁷), no de la derivación
propia de SQLCipher: scrypt es duro de memoria, así que una placa de video no
puede paralelizar barato. A SQLCipher se le pasa la clave ya derivada, cruda.

**No se guarda ningún hash de la contraseña.** La verificación es abrir la
base: si la clave está mal, SQLCipher no descifra ni la primera página. Un
verificador guardado sería un blanco contra el cual probar contraseñas sin
tocar los datos; no habiéndolo, no hay nada más barato que atacar.

La clave en claro vive **solo en el proceso principal**. Al renderer no se le
manda nunca: puede pedir "abrí" y "bloqueá", no la clave. Un XSS en una vista
no se puede llevar con qué descifrar.

Qué **no** cubre, dicho claro:

- Si alguien tiene la sesión de Windows abierta y "recordar en esta PC" está
  marcado, entra. Eso es exactamente lo que esa opción compra: comodidad a
  cambio de dejar la llave atada a la cuenta de Windows.
- Si se pierde la contraseña, se perdieron los datos. No hay recuperación y no
  puede haberla: es lo que significa que esté cifrado. La cerradura lo dice con
  todas las letras al crearla.
- La app no defiende contra alguien con acceso físico y tiempo mientras está
  desbloqueada. Para eso está el bloqueo por inactividad (15 min por defecto).

`llave.json` guarda la sal y los parámetros de derivación. **No es secreto** —
la sal es pública por diseño, existe para que dos instalaciones con la misma
contraseña no den la misma clave.

---

## El mapa

```
src/
  rutas.cjs       Dónde viven los datos: data/ en dev, userData empaquetada.
  llave.cjs       scrypt, safeStorage, cambio de contraseña.
  db.cjs          La base cifrada: esquema, migraciones y consultas.
  impresion.cjs   printToPDF y la impresora, sobre una ventana oculta.
  ipc.cjs         Qué puede pedir el renderer. TODO pasa por conBase().
  actualizador.cjs electron-updater contra los releases de GitHub.
  store.cjs       JSON en claro: SOLO preferencias de la interfaz.
renderer/
  index.html      Shell + la cerradura.
  imprimir.html   El documento que se imprime. Sin nada inline (ver CSP).
  css/hoja.css    Las hojas. Las cargan la app Y la impresión.
  js/
    hoja.js       Las plantillas clásica, RPE y retro; la orden reutiliza la RPE.
    actualizacion.js Estado, statusbar, aviso y controles del auto-update.
    desbloqueo.js La cerradura.
    campo-fecha.js Campo de fecha propio, sin el <input type=date> de Chromium.
    tienda.js     Estado compartido y validadores (DNI, CUIL).
    vistas/       Tablero, pacientes, recetas, órdenes, medicamentos,
                  estudios, ajustes.
```

---

## Las decisiones que no son obvias

### La receta emitida se congela

`receta.snapshot` guarda los datos del paciente y del profesional **tal como se
imprimieron**. Si mañana la paciente se muda o la doctora renueva la matrícula,
la receta de marzo tiene que seguir diciendo lo que decía en marzo — es un
documento que ya salió por la impresora. Las claves foráneas quedan solo para
poder listar "las recetas de esta paciente"; borrar al paciente no se lleva sus
recetas, que siguen siendo consultables.

### Una sola plantilla, dos consumidores

`renderer/js/hoja.js` y `renderer/css/hoja.css` los cargan la vista previa y la
ventana de impresión. A propósito: que la previa y el papel se vean distinto es
*el* bug clásico de estas apps, y la única forma segura de evitarlo es que no
existan dos hojas que puedan desincronizarse. `.rx-hoja` mide exactamente el
área imprimible de una A5 con 8 mm de margen (132 × 194 mm), y hay un test que
lo verifica en píxeles.

### El tope de dos medicamentos es legal, no de la hoja

Una receta admite **como máximo dos** medicamentos. La A5 entra dos porque dos
es lo que se puede recetar, no al revés — es una restricción de afuera, así que
no se resuelve bajando el interlineado.

Lo hace cumplir `db.recetas.emitir()`, no la vista. La vista apaga el botón
"Agregar" y enciende el aviso para que no se llegue a intentar, pero si eso
fallara el pedido rebota igual del otro lado: una regla que solo cumple la
interfaz es cuestión de tiempo hasta que un camino nuevo se olvide. El número
vive en un solo lugar (`MAX_MEDICAMENTOS`) y viaja al renderer por `app:info`.

No toca las recetas **ya** emitidas: si en una base vieja quedó alguna de tres,
se sigue viendo y se sigue reimprimiendo. Es un documento que ya salió por la
impresora.

La orden de estudios **no** tiene tope: pedir diez prácticas de laboratorio es
normal, y ahí el único límite es el físico de la hoja.

### La plantilla retro

La estructura de la RPE (caja del paciente, caja de cobertura, Rp/, hueco de
firma) vestida de recetario de imprenta, toda en Source Sans 3: lo que vendría
impreso en el talonario va en tinta verde, y lo que se completa, en negro. Los
valores salieron de una maqueta con perillas (`S:\mockups\rx`, punto de
partida «La de Quirotech», 13 oct 2026) y están fijos en `hoja.css`: con dos
medicamentos, membrete y cobertura sobran unos 3,4 mm sobre el hueco mínimo de
firma, así que agrandar una letra o alargar mucho las indicaciones la puede
tirar a dos páginas.

Los medicamentos van numerados, y los envases no tienen columna propia: salen
pegados a la presentación («Comprimidos x 21 x 1 env.»), o al nombre si no
hay presentación. En una columna aparte, lejos a la derecha, el número se leía
suelto. Entre medicamentos va una raya doble, y el DUPLICADO es un sello de
goma grafito (`#3b3b3b`), derecho, con la tinta gastada «al 30 %»: la máscara
de desgaste junta los puntos con una capa pareja al 70 %. Hasta la 0.2.6 fue
negro y al 60 %.

Es la única que imprime **membrete** (nombre, especialidad, matrícula,
domicilio y teléfono del profesional) y el **número de receta**. Los dos son
opcionales: si no están cargados, la hoja sale sin ellos.

El membrete además se apaga con el interruptor «Membrete del profesional» del
formulario, que aparece solo con la retro. El número de receta sale igual,
solo en su renglón y sin la raya doble. Apagado **no reserva lugar** arriba:
el paciente sube, así que no sirve para imprimir sobre papel que ya trae un
membrete impreso. La elección se congela en la instantánea
(`membrete: false`), así que reimprimir sale como salió; las recetas de antes
no lo tienen y salen con membrete, como salieron. Y queda guardada en los
ajustes (`membreteRetro`) para la receta siguiente: se apaga una sola vez.

Las fuentes viajan con la app (`renderer/fonts/`, OFL, licencias al lado) y se
declaran en `hoja.css`, no en `fonts.css`: la ventana de impresión no carga
`fonts.css`. El sello de DUPLICADO se gasta con una máscara,
`renderer/img/desgaste.png`, que sale de `tools/desgaste.mjs` con semilla fija.
Va como archivo porque `imprimir.html` no admite `data:`, y por eso su CSP
lleva `img-src 'self'`: sin eso, el sello sale sin gastar y sin avisar.

Las plantillas válidas viven en `PLANTILLAS` de `db.cjs`, que decide qué se
guarda, y en `PLANTILLAS` de `hoja.js`, que da los nombres. La columna no
tiene CHECK, así que sumar una plantilla no migra nada; pero si falta en la
lista de `db.cjs`, se guarda como clásica sin avisar.

### La orden de estudios: RPE o retro

Mismo circuito completo: paciente, hoja en vivo al lado, emitir, congelar la
instantánea, salir a papel o a PDF, y quedar en el historial y en la ficha. Lo
que cambia es el medio de la hoja: donde la receta lleva los medicamentos, la
orden pone cada estudio en su propio renglón. Sale en **una** sola hoja: el
duplicado de la receta existe porque se lo queda la farmacia, y la orden se la
queda el laboratorio y listo.

Desde la 0.3.0 la orden se emite en **RPE** o en **retro** (selector
«Plantilla» del formulario; queda la última usada, `plantillaOrden` en los
ajustes). Cada una comparte de verdad, no "parecido", con su receta: en la RPE,
las cajas del paciente y la cobertura, los renglones y el pie de firma salen de
las mismas funciones y reglas de `hoja.js` y `hoja.css`, y los estudios van
**sin numerar**; en la retro, el membrete (sin número: la orden no lleva), las
cajas, el pie y la tinta son los de la receta retro, y los estudios van
numerados en el margen como los medicamentos pero **sin la raya doble** entre
uno y otro. Dentro del pedido hay aire, no líneas. Dos copias del mismo
milímetro se desincronizan el día que una se toca — y acá eso significa dos
papeles que se ven distinto. El membrete de la orden retro usa el mismo
interruptor y el mismo ajuste (`membreteRetro`) que la receta retro.

Lo que encabeza el pedido es **texto libre** (campo «Encabezado del pedido»):
arranca en «Solicito:» y se puede cambiar por cualquier cosa o vaciar, y
vacío la hoja no imprime nada en ese lugar. En la retro ocupa el lugar y la
tinta del «Rp/». La plantilla, el encabezado y el membrete van solo en la
instantánea, sin migrar la base: una orden de antes de la 0.3.0 sale RPE y con
«Solicito:», como salió.

El diagnóstico va **uno** para toda la orden y no uno por estudio: en el papel
encabeza el pedido entero, y repetirlo en cada renglón sería ruido en una hoja
donde el lugar escasea.

### Un pedido largo no entra, y la previa lo dice

La A5 aguanta unos catorce estudios. Pasado eso la hoja sigue en una segunda
página, y eso es lo único que la vista previa **no** muestra sola: el papel
simplemente se dibuja más alto y no se nota hasta que ya salió por la
impresora. El rótulo del panel lo avisa, midiendo el alto contra el ancho del
mismo elemento (132 × 194 mm) para que el zoom de la previa se cancele solo en
vez de tener que compensarlo a mano.

No va en rojo: que un pedido largo ocupe dos hojas es un dato, no una falla. El
rojo de esta app está reservado al fallo y a la advertencia clínica.

### El recifrado tiene que bajar el WAL

SQLCipher se niega a recifrar con WAL activo ("Rekeying is not supported in WAL
journal mode"): el rekey reescribe todas las páginas y las que quedaran en el
diario seguirían con la clave vieja. `recifrar()` baja a journal clásico, hace
el rekey, y vuelve a subir — con `finally`, porque si el rekey falla la base no
puede quedarse en modo DELETE.

### `imprimir.html` no tiene nada inline

Su CSP es `script-src 'self'`, así que un `<script type="module">` inline queda
**bloqueado en silencio**: desde afuera lo único que se ve es que
`window.__pintar` nunca aparece y la hoja sale en blanco. El JS y el CSS de esa
página viven en sus propios archivos. Lo mismo vale para el `<style>`.

### Nada de `<input type="date">`

Abre el calendario nativo de Chromium: tipografía del sistema, colores del
sistema, y un ícono que no se puede teñir. Además es peor para cargar una fecha
de nacimiento — nadie quiere retroceder 46 años a flechazos. `campo-fecha.js`
formatea dd/mm/aaaa mientras se tipea y guarda ISO.

### La cerradura no se saca del DOM

`exit()` de `motion.js` termina con `el.remove()`. La cerradura tiene que
sobrevivir al cierre para poder volver a mostrarse cuando la app se bloquee de
nuevo, así que anima su salida a mano. Con `exit()`, el segundo bloqueo
escribía en un nodo huérfano: la sesión se cerraba de verdad, pero en pantalla
no pasaba nada.

### Los contadores se rehacen en cada navegación

Dejar que los actualice quien muta los datos parece más eficiente y es una
fuente inagotable de cifras viejas: alcanza con que un camino nuevo se olvide
de avisar. Son cuatro `count(*)` sobre una base local.

---

## Los tests

`npm run test:datos` es el que importa. No verifica "que la API no tire error"
sino:

- que el archivo en disco **esté realmente cifrado** (la cabecera no es
  `SQLite format 3`, y ni el apellido ni la alergia aparecen en crudo);
- que una contraseña equivocada **no** abra;
- que la receta y la orden emitidas no cambien cuando cambian los datos vivos;
- que la plantilla retro se guarde con su número, y que una desconocida caiga
  en clásica;
- que una receta de **tres** medicamentos sea rechazada, que dos entren, y que
  ese tope **no** se le aplique a la orden de estudios;
- que el respaldo salga cifrado y se pueda reabrir;
- que cambiar la contraseña recifre y la vieja deje de servir;
- que el PDF de la receta tenga **dos** páginas (original y duplicado) y el de
  la orden **una** sola;
- que una base del esquema 1 **migre sola** al abrirla, y que respalde antes de
  tocar nada. Es el camino riesgoso de verdad: la base nueva la estrena
  cualquiera que instale hoy, la vieja está en la PC de quien ya venía usando
  la app.

`npm run humo` monta la app de verdad, la desbloquea escribiendo la contraseña
en la cerradura, recorre las vistas, carga un paciente, emite una receta y una
orden, y vuelve a bloquear. Mide **dónde caen** los overlays, no solo si
existen.

`npx electron test/capturas.cjs <carpeta>` no es un test: siembra datos de
muestra y saca capturas para mirar cómo quedó.

---

## Empaquetar

```
npm run build          # → dist/Quiron-Setup-<versión>.exe
npm run test:paquete   # y verificarlo, que no es opcional
```

Instalador NSIS, no `oneClick`: deja elegir carpeta y se instala por usuario
(sin pedir admin).

**El módulo nativo es lo único delicado.** Dos cosas que tienen que estar:

1. `asarUnpack` lo saca del asar. Un `.node` **no se puede cargar desde adentro
   de un asar**: la app abriría bien y moriría recién al intentar descifrar la
   base, o sea al desbloquear.
2. `npmRebuild: false`. Desde la 0.2.1 la librería
   (`better-sqlite3-multiple-ciphers` 13) trae su binario ya compilado con
   Node-API, que sirve para cualquier Electron: no hay nada que reconstruir, y
   dejar que electron-builder lo intente obligaría a tener MSVC para nada.
   Hasta la 0.2.0 (la 12, Electron 40) había que correr `rebuild:nativos`
   contra el ABI de cada Electron; ese paso ya no existe.

### Actualizar Electron o la librería de cifrado

Las dos versiones van fijas en `package.json`, sin `^`, a propósito: del otro
lado hay historias clínicas reales y un cambio de librería no puede entrar solo
con un `npm install`. Antes de publicar, **`npm run test:compat`**: abre
`test/fixtures/base-v12`, una base que hizo la librería vieja (la 12.11.1 en
Electron 40; ver su `LEEME.txt`), con la que esté instalada ahora, y comprueba
que se lee entera, con los acentos intactos, que se puede seguir escribiendo y
que `integrity_check` da `ok`. Ese fixture no se regenera nunca: su valor es
que lo hizo la versión vieja.

Para el salto a Electron 44 (oct 2026) además se probó, una sola vez y fuera
del repo, una copia de una `%APPDATA%\Rx` real: misma cantidad de filas y el
mismo hash del contenido en las diez tablas antes y después, y la clave de
«recordar en esta PC» guardada con Electron 40 se leyó con la 44.

`test:paquete` contesta las dos preguntas que un test del fuente no puede:

- **¿El `.node` que se envía cifra de verdad?** Se carga el módulo desde
  `app.asar.unpacked` y se le hace un ciclo completo. Que el archivo exista no
  prueba nada: podría ser el binario de Node en vez del de Electron.
- **¿El renderer monta, o es pantalla en blanco?** Se arranca el `.exe` con
  `--remote-debugging-port` y se le mira el DOM por CDP: que el splash se haya
  ido, que la cerradura esté dibujada, que los tokens hayan cargado y que los
  `<i data-icon>` sean SVG. El `<title>` **no** alcanza — una pantalla en blanco
  también tiene título.

Los datos de la app instalada van a `%APPDATA%\Quiron`, no al lado del ejecutable:
esa carpeta es de solo lectura y además una actualización la reemplaza entera.
`RX_DATA` manda sobre todo, y sirve para correr una copia contra datos falsos.

### La mudanza de los datos (de Rx y Quirotech a Quiron)

Hasta la 0.2.3, `main.cjs` fijaba `userData` en `%APPDATA%\Rx` para que quien
actualizaba desde Rx no abriera la app vacía. De la 0.2.4 a la 0.2.6 los datos
vivieron en `%APPDATA%\Quirotech`, y desde la 0.3.0 viven en `%APPDATA%\Quiron`
(lo que Electron deriva solo del nombre). Quien viene de cualquiera de las dos
**se muda al arrancar**: `src/carpeta.cjs` renombra la carpeta entera, antes de
que Chromium escriba nada. Renombrar y no copiar es lo que hace que la base
cifrada, la sal, los respaldos y la llave de «recordar en esta PC» (safeStorage
la guarda en `Local State`) viajen juntas. Si hay datos en las dos viejas, se
muda la más nueva (Quirotech) y Rx no se toca.

Ningún caso abre la app vacía: si el renombre falla, esa vez usa la vieja y lo
reintenta en el próximo arranque; si ya hay una `Quiron` con datos, manda esa;
si hay una con algo que no son datos, usa la vieja y no pisa nada.
`test/carpeta.test.mjs` arma cada caso con carpetas temporales, una vez desde
cada nombre viejo. Para la 0.2.4 se probó además que una clave recordada sigue
leyéndose después de renombrar la carpeta (Electron 44), y el paquete de punta
a punta: una `Rx` con clave recordada se mudó y la app entró sola.

El `appId` sigue siendo `com.kiddshady.rx`: es lo que hace que el instalador
reemplace a la versión anterior en vez de instalarse al lado.

### Actualizaciones

La aplicación instalada consulta al arrancar la última release estable de
[`kiddshady/Quiron`](https://github.com/kiddshady/Quiron). El repo se llamó
`Rx` y después `Quirotech`; GitHub redirige los nombres viejos, y por eso una
Rx o una Quirotech instalada encuentra la primera Quiron. Si encuentra una versión
nueva, descarga el instalador en segundo plano y avisa en la barra de estado.
Nunca reinicia sola: se aplica al tocar **Reiniciar y actualizar** o al cerrar
la app después de que terminó la descarga.

En desarrollo el actualizador queda inactivo porque no existe `app-update.yml`.
El paquete sí lo lleva y `test:paquete` comprueba que apunta al repo correcto,
que `latest.yml` coincide con la versión y que existe el `.blockmap`.

---

## Lo que falta

- **Vademécum.** El catálogo es la lista corta de lo que la doctora receta
  seguido, cargada a mano. Importar un vademécum real es otra cosa.
- **La agenda de turnos** quedó descartada, no pendiente.

---

## La marca

La vara de Asclepio con la serpiente enroscada, sobre la baldosa a sangre. El
dibujo vive en **un solo archivo**, `build/icono.mjs`, y la serpiente es una
hélice de verdad: cada tramo sabe si pasa por delante o por detrás del bastón
(`z = cos θ`), así que el orden de pintado y la sombra de las vueltas de atrás
salen solos. Tiene dos versiones:

- **la grande**, con dos vueltas y cuarto, escamas, brillo, grano y la retícula
  de papel de electro de fondo;
- **la chica**, con vuelta y cuarto y trazos gruesos, para 32 px y menos: a ese
  tamaño la grande es una mancha.

`npm run icon` (build/make-icon.cjs) las rasteriza con el Chromium de Electron,
cada tamaño dibujado a su medida, a todo lo que muestra la marca:

| Archivo | Para |
|---|---|
| `build/icon.ico` | Windows: 16/20/24/32 la chica · 40 a 256 la grande |
| `build/icon.png` | La base de electron-builder (1024) |
| `renderer/img/marca.png` | El splash y la cerradura |
| `renderer/img/marca-chica.png` (y `@2x`) | La titlebar |

`npm test` falla si alguno de esos archivos es más viejo que `icono.mjs`: así
no se puede cambiar el dibujo y olvidarse de regenerar.

## La piel

La física es la de Opal: una sola superficie opaca, hojas de alfa de blanco,
el vidrio solo donde puede muestrear y lo primario tallado (obsidiana con el
canto encendido), nunca relleno de acento. Lo propio de Quiron está en
`renderer/css/quirotech.css`:

- **El sustrato es papel de electro.** La grilla de 1 mm y la de 5 mm, en menta
  apenas, debajo de la niebla. En las hojas se lee como textura; en el aire
  (titlebar, márgenes) como papel.
- **Las perillas:** acento menta (`94 234 212`), matiz 195 con tint 1,5, blur
  20 px. La letra es **Geist** y los datos van en **Geist Mono** (OFL, en
  `renderer/fonts/`).
- **Tres colores con significado**, como en Beacon: menta es un canto, una
  línea o un punto; **ámbar pide atención** (las alergias); rojo dice que algo
  falló. Rx pintaba las alergias de rojo; desde Quirotech (y en Quiron) son ámbar.

El tablero tiene la curva de recetas de los últimos 30 días (con un barrido
tipo monitor que respeta el movimiento reducido) y «Atendidos hoy», que son las
evoluciones con fecha de hoy y la hora en que se anotaron. La ficha tiene
pestañas y la filiación en el panel derecho del shell, que se vacía al salir de
la ficha y al bloquear: un dato de paciente no queda en el DOM de una pantalla
que no lo muestra (el humo lo verifica).
