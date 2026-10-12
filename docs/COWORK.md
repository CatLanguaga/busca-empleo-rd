# Usar busca-empleo-rd desde Claude Cowork

No necesitas la terminal para el día a día. career-ops funciona dentro de Claude Cowork (la app de escritorio de Claude que trabaja con tus carpetas), y busca-empleo-rd con él. La guía original es `docs/COWORK.md` de career-ops; esta página añade lo propio de busca-empleo-rd.

> Estado: career-ops verificó su flujo en Cowork. La combinación con busca-empleo-rd (plugin `rd-boards`, detector) todavía **no está verificada por nosotros** dentro de Cowork. Si la pruebas, cuenta en un issue qué funcionó y qué no.

## 1. Instalación (una sola vez, en la terminal)

Cowork no puede instalar dependencias por sí mismo, así que esto se hace antes:

```bash
npx @santifer/career-ops init career-ops      # crea la carpeta career-ops e instala dependencias
git clone https://github.com/CatLanguaga/busca-empleo-rd.git
node busca-empleo-rd/install.mjs career-ops
cd career-ops
node plugins.mjs enable rd-boards             # muestra qué permisos pide
node plugins.mjs enable rd-boards --confirm
```

Deja las dos carpetas, `career-ops` y `busca-empleo-rd`, una al lado de la otra.

## 2. Primera sesión en Cowork

1. Abre Claude Cowork y añade la carpeta `career-ops`. Añade también `busca-empleo-rd` si quieres usar el detector de empresas.
2. Escribe:
   > Esta carpeta contiene career-ops. Lee AGENTS.md, ejecuta su comprobación de inicio (`node doctor.mjs --json`) y guíame por la configuración inicial según lo que diga. Busco empleo en República Dominicana.
3. Dale tu CV: pega el texto o señala un PDF.
4. Cuando te pregunte por tus roles, pídele también:
   > Pon mis roles como `queries` de Computrabajo RD en portals.yml y actívalo. Ajusta también `title_filter` a mis roles: el que viene es de ejemplo.

## 3. Día a día

Hablas normal. Frases que funcionan:

| Quieres | Dile |
|---|---|
| Ver ofertas nuevas | "Escanea mis portales y muéstrame lo nuevo" |
| Evaluar una oferta | "Evalúa esta oferta: <enlace o texto pegado>" |
| CV y carta para una oferta | "Hazme el CV para esta" · "Prepárame la carta" |
| Seguimiento | "¿Cómo van mis postulaciones?" · "¿A quién le debo seguimiento?" |
| Concursos del Estado | "¿Qué concursos abiertos hay en Concursa?" |
| Saber dónde publica una empresa | "Usa descubrir.mjs de busca-empleo-rd para ver dónde publica vacantes Banreservas (https://www.banreservas.com)" |
| Añadir una empresa que resolvió | "Añádela a mis portales con `--write`" |

## 4. Qué corre dentro de Cowork y qué no

| Tarea | En Cowork |
|---|---|
| Evaluar ofertas, informes, seguimiento, cartas | Sí |
| Escanear (`node scan.mjs`): bolsas de RD, Concursa, Banco Popular y demás | Depende de la red del sandbox. Ver abajo. |
| Detector (`node descubrir.mjs`) | Igual: depende de la red del sandbox. |
| Generar PDF del CV y de la carta | No directamente: el navegador que los genera vive en tu máquina. Cowork prepara el HTML; el PDF se genera desde la terminal o imprimiendo el HTML a PDF. |

### Si el escaneo falla por red

El sandbox de Cowork puede no tener salida a todos los sitios. Si "escanea mis portales" da errores de red, corre el escaneo en la terminal y sigue en Cowork:

```bash
cd career-ops
node scan.mjs
```

Las ofertas nuevas quedan en `data/pipeline.md`. Luego en Cowork: *"procesa mi pipeline"*.

## 5. Empleadores que el escáner no lee

Hay dos usos distintos del navegador, y conviene no mezclarlos:

- **Mapear dónde publica un empleador** (una vez): averiguar cuál es su portal de empleo y qué sistema usa, para que el detector y el escáner sepan a dónde mirar. Tiene su propio procedimiento y un texto listo para pegar: [MAPEO.md](MAPEO.md).
- **Mirar una vacante que te interesa** (día a día): lo que sigue.

El registro (`data/empresas-rd.yml`) marca muchos empleadores como `pagina-propia`, `portal-externo`, `sin-enlace` o `bloqueada`: Superintendencia de Bancos, Banco Central, Claro, Banreservas y otros. El escáner no los cubre, pero tú sí puedes mirarlos, y el asistente puede mirarlos contigo.

Si tu Cowork tiene navegador (Claude en Chrome o el navegador integrado), puedes pedirle que abra **la página que tú abrirías** y te diga qué hay:

> Abre https://sb.gob.do/sobre-nosotros/unete-a-nuestro-equipo/ y dime qué vacantes lista. Si alguna encaja con mi perfil, evalúala.

> Abre la página de empleo de Claro (https://vacantes.claro.com.do/) y busca vacantes de <tu rol>.

Un navegador de verdad carga páginas que un script no puede (las que necesitan JavaScript, por ejemplo). Eso no es lo mismo que saltarse una protección, y busca-empleo-rd lo trata distinto:

**Sí:**

- Abrir una página concreta que te interesa, a pedido tuyo, y leer lo que muestra.
- Evaluar una vacante que encontraste así, pegando o leyendo su texto.
- Aplicar tú, en el sitio del empleador, con el CV y la carta que preparaste.

**No:**

- **Resolver CAPTCHAs o verificaciones "no soy un robot".** Si aparece una, la resuelves tú o se deja esa página. El asistente no las resuelve y no debe intentarlo.
- **Entrar con tu usuario y contraseña** a portales de empleo. Inicia sesión tú si hace falta.
- **Recorrer en bucle** la lista de empleadores bloqueados para "escanearlos por navegador", ni programarlo. Eso es exactamente el acceso automatizado que esos sitios rechazan; hacerlo desde un navegador no lo vuelve aceptable y puede costarte el acceso desde tu propia conexión.
- **Añadir esos sitios al escáner.** Una fuente entra al plugin solo si su `robots.txt` permite sus listados (ver [FUENTES.md](FUENTES.md)).

Regla práctica: si es algo que harías tú a mano una tarde, mirando cinco o seis empleadores que de verdad te interesan, el asistente puede hacerlo contigo. Si es "todos, cada día", no.

## 6. Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "Plugin rd-boards is not enabled" | Faltó activarlo | En terminal: `node plugins.mjs enable rd-boards --confirm` |
| El escáner encuentra ofertas pero descarta todas | `title_filter` de `portals.yml` sigue con los roles de ejemplo | "Ajusta title_filter a mis roles" |
| Computrabajo no devuelve nada | Viene desactivado hasta poner tus `queries` | "Pon mis roles como queries de Computrabajo RD y actívalo" |
| "files changed since you trusted it" tras actualizar busca-empleo-rd | El plugin cambió | En terminal: `node plugins.mjs trust rd-boards` |
| Errores de red en todo | Sandbox sin salida | Escanear desde terminal (sección 4) |
