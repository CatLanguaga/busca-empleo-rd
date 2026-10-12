# Créditos y avisos

busca-empleo-rd se apoya en dos proyectos de código abierto. Este archivo dice qué vino de cada uno.

## career-ops

- Repositorio: <https://github.com/career-ops-hq/career-ops>
- Autor: Santiago Fernández de Valderrama ([@santifer](https://github.com/santifer)) y colaboradores.
- Licencia: MIT — Copyright (c) 2026 Santiago Fernández de Valderrama.

busca-empleo-rd **no redistribuye career-ops**: se instala sobre una copia que cada persona descarga del repositorio original, y usa sus puntos de extensión públicos. El único código tomado de career-ops es el arranque de la prueba del plugin, indicado abajo, bajo su licencia MIT.

| En busca-empleo-rd | Se apoya en (career-ops) |
|---|---|
| `plugins/rd-boards/` | Contrato de plugins (`docs/PLUGINS.md`, `plugins/README.md`), tipo `Job` y `Provider` (`providers/_types.js`). |
| `plugins/rd-boards/test/smoke.mjs` | Sus primeras comprobaciones (importar la entrada y validar hooks contra el manifiesto) vienen de la plantilla `plugins/_template/test/smoke.mjs` de career-ops. Código copiado y adaptado. |
| `descubrir.mjs` | Importa, desde la carpeta de career-ops de quien lo ejecuta, `loadProviders` y `resolveProvider` (`providers/_registry.mjs`), `makeHttpCtx` (`providers/_http.mjs`) y `renderPortalEntry`, `insertIntoTrackedCompanies`, `dedupeAgainstPortals`, `yamlScalar` (`discover-ats.mjs`). No se copian. La idea de un detector de tableros es de `discover-ats.mjs`; el recorrido desde la web del empleador es propio. |
| `overlay/empresas.rd.yml` | Entradas que leen los proveedores `successfactors`, `oraclecloud` y `teamtailor` de career-ops. |
| `overlay/custom.rd.md` → revisor de CV | Activa `modes/pdf/hm-audit.md`, que es de career-ops. |
| `overlay/portals.rd.yml` | Formato de `templates/portals.example.yml`. |
| `docs/FUENTES.md` | Aplica su Source Indexing Policy (`CONTRIBUTING.md`). |
| `docs/COWORK.md` | Resume y amplía su `docs/COWORK.md`. |

"career-ops" es una marca de su autor (ver su `TRADEMARK.md`). Aquí se usa solo para describir compatibilidad y origen. busca-empleo-rd no es un producto oficial ni está avalado por career-ops.

## ai-job-search

- Repositorio: <https://github.com/MadsLorentzen/ai-job-search>
- Autor: Mads Lorentzen ([@MadsLorentzen](https://github.com/MadsLorentzen)) y colaboradores.
- Licencia: MIT — Copyright (c) 2026 Mads Lorentzen.

busca-empleo-rd **no incluye código de ai-job-search**. Adapta, reescritas para career-ops, estas ideas:

| En busca-empleo-rd (`overlay/custom.rd.md`) | Idea original (ai-job-search) |
|---|---|
| Revisor de carta de presentación | Flujo redactor-revisor: `.claude/commands/apply.md`, pasos 3–4. |
| Guardar hechos nuevos en el mismo turno | "Standing rule — write new facts back to the profile", en `.claude/commands/apply.md`. |
| Inspección visual obligatoria del PDF | `.claude/commands/apply.md`, paso 5. |
| Perfil conductual y nota de encaje | `.claude/skills/job-application-assistant/02-behavioral-profile.md`. |
| Parsers por regex sobre tarjetas, sin dependencias | Enfoque de sus CLIs de portales (`.agents/skills/*-search/`). |

## Bolsas de empleo

Computrabajo, Tecoloco, DiarioEmpleo, RD Trabaja, Concursa, Evaluar y los empleadores listados en `data/empresas-rd.yml` son marcas, servicios e instituciones de sus respectivos titulares. busca-empleo-rd no está afiliado a ninguno. Lee solo sus páginas públicas de listado, dentro de lo que permite el `robots.txt` de cada sitio. Detalle en [docs/FUENTES.md](docs/FUENTES.md).

Si administras una de estas bolsas y prefieres que no se lea, abre un issue y se retira.

## Licencia de busca-empleo-rd

MIT — Copyright (c) 2026 Omar Bautista. Ver [LICENSE](LICENSE).
