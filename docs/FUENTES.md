# Fuentes

Qué bolsas lee busca-empleo-rd, qué se revisó antes de leerlas, y cuáles se evaluaron y quedaron fuera.

La regla es la misma que usa career-ops para sus fuentes (Source Indexing Policy, en su `CONTRIBUTING.md`): ofertas reales y gratuitas para el candidato, y el `robots.txt` de cada sitio leído **por ruta**, bajo el grupo `User-agent: *`. Si una regla `Disallow` cubre las rutas de listado, la bolsa no se lee.

Revisión: **12 de octubre de 2026**. Los sitios cambian; si una bolsa deja de funcionar o cambia su `robots.txt`, abre un issue.

## Soportadas

| Bolsa | Sitio | Cómo se lee | Qué dice su robots.txt | Límites |
|---|---|---|---|---|
| Computrabajo RD | do.computrabajo.com | HTML de `/trabajo-de-{palabra}` y `?p=N` | Prohíbe `/ofertas-de-trabajo/` con parámetros de filtro (`pubdate=`, `sal=`, `cont=`, `dis=`, `by=`, `emp=`…), `/Ajax/`, `/_services/`, `/go/`. La ruta de búsqueda por palabra no está cubierta. | Solo por palabra clave: hay que definir `queries`. 20 ofertas por página. |
| Tecoloco RD | www.tecoloco.com.do | HTML de `/empleos` y `/empleo-{categoría}`, `?PerPage=100&Page=N` | Prohíbe solo rutas de servicio (`/SelectNewsReader.aspx`, `/AddRssLink.aspx`, `/partners/ads-data`, `/company-questionnaire`, `/WebService/AjaxWS.asmx/`). | Unas 120 ofertas en total a la fecha de revisión. |
| DiarioEmpleo | diarioempleo.com (empleos.do redirige aquí) | HTML de `/empleos` | `Allow: /`; prohíbe rutas de cuenta y `/buscar`. No se usa `/buscar`. | Bolsa pequeña: 10 ofertas a la fecha de revisión, todas en una página. |
| RD Trabaja | empleateya.mt.gob.do | API JSON pública `/api/puestos` (la misma que usa su web) | No publica `robots.txt` (404). | **No publica el empleador** ni tiene página por puesto. Ver abajo. |

| Concursa | map.gob.do/Concursa/ | HTML del listado y `?pagina=N` | `map.gob.do` prohíbe solo `/wp-admin/`. | Concursos públicos del Estado. Solo los abiertos; no se descargan los PDF de bases. Volumen bajo. |
| Evaluar | `{empresa}.evaluar.com` | API pública de WordPress `/wp-json/wp/v2/job-listings` | `Disallow:` vacío (nada prohibido), leído en `humano.evaluar.com`. | Un sitio por empleador; hoy Grupo SID y Humano. El dato de contacto del reclutador que trae la API no se guarda. |

### Empleadores con bolsa propia

Además de las bolsas, busca-empleo-rd incluye empleadores cuyo portal usa un sistema que career-ops ya lee. No los lee este plugin: los lee el proveedor correspondiente de career-ops. Se hallaron con `descubrir.mjs`; lista y fecha en [EMPRESAS.md](EMPRESAS.md).

| Empleador | Sistema | Ruta que se lee | robots.txt del portal |
|---|---|---|---|
| Banco Popular Dominicano | SAP SuccessFactors (sitio de marca `empleos.grupopopular.com`) | `/tile-search-results/` | Prohíbe `/services/`, `/applybutton/`, `/talentcommunity/` y otras rutas de cuenta. La ruta leída no está cubierta. |
| Grupo Universal | Oracle Cloud Recruiting | La que usa el proveedor `oraclecloud` de career-ops | Comprobado por el detector: ninguna ruta pedida está prohibida |
| Cervecería Nacional Dominicana, Grupo InterEnergy (CEPM) | Teamtailor | `/jobs.rss` | Comprobado por el detector: ninguna ruta pedida está prohibida |

"Comprobado por el detector": `descubrir.mjs` registra cada URL que pide el lector y la contrasta con el `robots.txt` del portal. Si alguna está prohibida, el empleador no se incluye. Así quedó fuera **Claro** (`vacantes.claro.com.do`): su listado solo sale por `/services/…`, que su `robots.txt` prohíbe.

### RD Trabaja: lo que hay que saber

Es el portal de empleo del Ministerio de Trabajo. El Ministerio intermedia entre empresa y candidato, así que:

- Las ofertas no dicen qué empresa contrata. busca-empleo-rd las marca como `RD Trabaja (empleador no publicado)` y nunca intenta adivinarla.
- No existe un enlace directo a cada puesto. El enlace que guarda busca-empleo-rd abre el portal; hay que buscar el puesto por título y aplicar allí con una cuenta (gratuita).
- Unos 485 puestos a la fecha de revisión.

## Evaluadas y no soportadas

| Bolsa | Motivo |
|---|---|
| Aldaba (aldaba.com) | Su `robots.txt` dice `User-agent: * / Disallow: /` y solo permite `/index.php`. Los listados de ofertas están en `ver_ofertas.php` y `est_ofertas.php`, que quedan prohibidos. `/index.php` solo sirve el selector de país. No se lee. |
| SAP SuccessFactors clásico (`career*.successfactors.com`, `career*.sapsf.com`) | Portal de candidato que usan EGE Haina, Grupo Ramos y APAP. Su `robots.txt` es `User-agent: * / Disallow: /`. No se lee. (El Banco Popular usa otro producto de SuccessFactors, en dominio propio, que sí lo permite.) |
| Emplea.do | Es un agregador: republica ofertas de Computrabajo, Aldaba, Get on Board, Remote OK y otras. career-ops no indexa agregadores de agregadores (se lee cada fuente directamente). Además su `robots.txt` bloquea a `ClaudeBot`. |
| Jooble (do.jooble.org) | Responde 403 con desafío anti-bot. Es también un agregador. |
| Indeed (do.indeed.com) | No responde a peticiones directas; requiere evasión anti-bot, que este proyecto no hace. |
| EmpleosRD (empleosrd.com), Buscojobs (buscojobs.do) | Sin respuesta desde la red de prueba a la fecha de revisión. |
| Opcionempleo (opcionempleo.com.do) | Agregador (Careerjet) con desafío anti-bot. |
| LinkedIn | Sus términos prohíben el acceso automatizado. Fuera de este repo. |

## Qué no hace este proyecto

- No evade bloqueos anti-bot, CAPTCHAs ni muros de inicio de sesión.
- No usa cuentas ni credenciales de nadie.
- No reintenta ante un 429 ni escanea en bucle: 750 ms entre peticiones y tope de 20 peticiones por entrada.
- No envía postulaciones. Tú revisas y tú envías.

## Proponer una bolsa nueva

Abre un issue con: URL de la bolsa, su `robots.txt` completo, la ruta de listado que habría que leer, y si muestra el nombre del empleador. Sin esos cuatro datos no se puede decidir.
