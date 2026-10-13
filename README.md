# busca-empleo-rd

**Búsqueda de empleo con IA, hecha para República Dominicana.**

busca-empleo-rd es un complemento para [career-ops](https://github.com/career-ops-hq/career-ops). career-ops es un sistema de código abierto que corre en tu computadora y, con un asistente de IA (Claude Code, Claude Cowork, Codex y otros), evalúa ofertas contra tu CV, adapta tu CV y tu carta a cada una, y lleva el seguimiento de tus postulaciones. Viene pensado para empresas de tecnología de EE. UU. y Europa.

busca-empleo-rd le añade lo dominicano:

- **Bolsas de empleo de RD** dentro del escáner: Computrabajo RD, Tecoloco RD, DiarioEmpleo, RD Trabaja (Ministerio de Trabajo), Concursa (concursos del Estado) y Unika.
- **Bolsas propias de empleadores dominicanos**, como la del Banco Popular, y un detector para encontrar más.
- **Contexto laboral dominicano** al evaluar: salario de Navidad, bonificación, cesantía, TSS, ISR, pesos o dólares, empleado o contratista.
- **Revisión extra** de CV y carta antes de entregártelos, y reglas para que el asistente no invente ni pierda datos tuyos.
- **Guía en español**, incluida la de uso sin terminal desde Claude Cowork.

No envía postulaciones por ti. Prepara todo; tú revisas y tú envías.

> Proyecto independiente y comunitario. Sin afiliación con career-ops, ai-job-search, Anthropic, ni con ninguna de las bolsas de empleo. Ver [Créditos](#créditos).

## Requisitos

- [Node.js](https://nodejs.org) 22.13 o superior, y [Git](https://git-scm.com).
- Un asistente de IA compatible con career-ops. Claude Code y Claude Cowork requieren suscripción de pago; career-ops documenta opciones gratuitas en su `docs/FREE_TIER.md`.

## Instalación

```bash
# 1. Crea tu carpeta de career-ops
npx @santifer/career-ops init career-ops

# 2. Descarga busca-empleo-rd al lado
git clone https://github.com/CatLanguaga/busca-empleo-rd.git

# 3. Instala busca-empleo-rd sobre career-ops
node busca-empleo-rd/install.mjs career-ops

# 4. Activa el plugin de bolsas dominicanas
cd career-ops
node plugins.mjs enable rd-boards            # muestra qué permisos pide
node plugins.mjs enable rd-boards --confirm
```

Luego abre tu asistente dentro de `career-ops` (por ejemplo `claude`) y dile:

> Busco empleo en República Dominicana. Guíame por la configuración inicial y pon mis roles como `queries` de Computrabajo RD en portals.yml.

¿Sin terminal para el día a día? Ver [docs/COWORK.md](docs/COWORK.md).

### Qué toca el instalador

Solo la capa de usuario de career-ops, la que sus actualizaciones nunca sobrescriben:

| Archivo en career-ops | Qué hace |
|---|---|
| `plugins.local/rd-boards/` | Copia el plugin. |
| `modes/_custom.md` | Añade un bloque marcado con las reglas para RD. |
| `portals.yml` | Añade dos bloques marcados: las bolsas dentro de `job_boards:` y los empleadores dentro de `tracked_companies:`. |

No toca tu CV, tu perfil ni nada fuera de sus marcas. Guarda copia `.bak` de lo que modifica. Puedes ver qué haría sin escribir nada con `--dry-run`, y volver a correrlo para actualizar.

## Uso

```bash
node scan.mjs --dry-run     # ver ofertas nuevas sin guardar
node scan.mjs               # guardarlas en data/pipeline.md
```

Y con el asistente, en lenguaje normal: "procesa mi pipeline", "evalúa esta oferta: <enlace>", "hazme el CV para esta", "prepárame la carta", "cómo van mis postulaciones".

## Fuentes

| Bolsa | Notas |
|---|---|
| Computrabajo RD | Por palabra clave: defines tus roles en `queries`. |
| Tecoloco RD | Listado completo o por categoría. |
| DiarioEmpleo | Bolsa pequeña. |
| RD Trabaja | Portal del Ministerio de Trabajo. **No publica qué empresa contrata** y se aplica dentro del portal. |
| Concursa | Concursos públicos del Estado (Ministerio de Administración Pública). Pocos a la vez. |
| Unika | Intermediaria laboral. **No publica qué empresa contrata**; cada fila suele agrupar las vacantes de un área. |
| Evaluar | Plataforma donde tienen su bolsa Grupo SID y Humano Seguros. |

Y empleadores con bolsa de empleo propia: **Banco Popular Dominicano, Grupo Universal, Cervecería Nacional Dominicana, Grupo InterEnergy (CEPM)**.

Cada fuente se lee respetando su `robots.txt`, con pausas entre peticiones y sin evadir bloqueos. Aldaba, Emplea.do, Indeed, Jooble, LinkedIn y el portal clásico de SuccessFactors se evaluaron y **no** se incluyen; el motivo de cada una está en [docs/FUENTES.md](docs/FUENTES.md).

## Empresas e instituciones dominicanas

`descubrir.mjs` busca dónde publica sus vacantes un empleador, partiendo de su página web:

```bash
node descubrir.mjs ../career-ops "Nombre=https://www.su-sitio.com.do"   # una empresa
node descubrir.mjs ../career-ops --in data/empresas-rd.yml              # las 40 del registro
```

Solo muestra; con `--write` guarda las que resuelven. El registro [`data/empresas-rd.yml`](data/empresas-rd.yml) tiene bancos, aseguradoras, telecomunicaciones, energía, consumo y sector público (Superintendencia de Bancos, Banco Central, DGII, TSS y otras), con lo que se encontró en cada una. Resultados y cómo proponer más: [docs/EMPRESAS.md](docs/EMPRESAS.md).

## Documentación

- [docs/FUENTES.md](docs/FUENTES.md) — qué se lee, qué se revisó, qué quedó fuera y por qué.
- [docs/MERCADO-RD.md](docs/MERCADO-RD.md) — qué considera el asistente del mercado laboral dominicano.
- [docs/COWORK.md](docs/COWORK.md) — uso desde Claude Cowork.
- [docs/MAPEO.md](docs/MAPEO.md) — revisión con navegador para hallar portales que el detector no ve.
- [docs/EMPRESAS.md](docs/EMPRESAS.md) — añadir empresas.
- [plugins/rd-boards/skill.md](plugins/rd-boards/skill.md) — configuración del plugin.

## Avisos

- **No es asesoría legal ni fiscal.** El contexto laboral es orientación para comparar ofertas.
- **Las bolsas cambian.** Si una deja de funcionar, el escáner lo reporta como error; abre un issue.
- **Tus datos se quedan en tu máquina**, salvo lo que tu asistente de IA envía a su proveedor para trabajar. busca-empleo-rd no tiene servidor ni telemetría.
- **Úsalo con moderación.** Pocas búsquedas, bien dirigidas. Esto es para postular mejor a menos ofertas, no para postular en masa.

## Créditos

busca-empleo-rd es una capa delgada sobre el trabajo de otras personas.

- **[career-ops](https://github.com/career-ops-hq/career-ops)** — Santiago Fernández de Valderrama ([@santifer](https://github.com/santifer)) y su comunidad. Licencia MIT. Es todo el sistema: evaluación, CV, cartas, escáner, seguimiento, motor de plugins. busca-empleo-rd no lo modifica ni lo redistribuye; se instala encima.
- **[ai-job-search](https://github.com/MadsLorentzen/ai-job-search)** — Mads Lorentzen ([@MadsLorentzen](https://github.com/MadsLorentzen)) y colaboradores. Licencia MIT. De ahí vienen las ideas del revisor de carta, guardar hechos nuevos al momento, la inspección del PDF y el perfil conductual.

Detalle de qué vino de dónde, y avisos de licencia: [NOTICE.md](NOTICE.md).

"career-ops" es una marca de su autor; busca-empleo-rd la menciona solo para indicar compatibilidad y origen.

## Contribuir

Issues y PRs bienvenidos, sobre todo: bolsas dominicanas nuevas (con su `robots.txt` revisado), correcciones cuando una bolsa cambie su página, y mejoras a la guía. No se aceptan fuentes que requieran evadir bloqueos, ni nada que envíe postulaciones automáticamente.

```bash
node plugins/rd-boards/test/smoke.mjs
node test/install.test.mjs
node test/descubrir.test.mjs
```

## Licencia

[MIT](LICENSE) © 2026 Omar Bautista.
